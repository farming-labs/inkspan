import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

if (!process.argv[2])
  throw new Error("Pass a consumer directory with the packed Inkspan package installed.");
const consumer = resolve(process.argv[2]);
const require = createRequire(join(consumer, "package.json"));
const defaultEntry = require.resolve("@farming-labs/inkspan");
require.resolve("@farming-labs/inkspan/browser");
const outdir = join(consumer, "browser-build");
const defaults = await build({
  entryPoints: [defaultEntry],
  bundle: true,
  write: false,
  platform: "browser",
  format: "esm",
  minify: true,
  metafile: true,
});
assert.ok(
  !Object.keys(defaults.metafile.inputs).some((file) =>
    /(?:^|\/)(?:generated\/engine[^/]*|lib\/(?:node|browser-wasm)\.js)$/.test(file),
  ),
  "Default imports include Wasm or Node code.",
);
const fixture = join(consumer, "browser-smoke.mjs");
writeFileSync(
  fixture,
  readFileSync(fileURLToPath(new URL("./browser-smoke.mjs", import.meta.url))),
);
const result = await build({
  entryPoints: [fixture],
  outdir,
  bundle: true,
  splitting: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  minify: true,
  metafile: true,
  chunkNames: "[name]-[hash]",
});
const loader = Object.entries(result.metafile.outputs).find(([, entry]) =>
  entry.entryPoint?.endsWith("lib/browser-wasm.js"),
);
assert.ok(loader, "Wasm was not emitted as a deferred chunk.");
assert.ok(
  !Object.keys(result.metafile.inputs).some((file) => file.endsWith("lib/node.js")),
  "The browser bundle includes Node's loader.",
);
const files = new Map(
  Object.keys(result.metafile.outputs).map((file) => [basename(file), resolve(file)]),
);
const metadata = {
  defaultBytes: defaults.outputFiles[0].contents.length,
  loaderChunk: basename(loader[0]),
  outputs: Object.keys(result.metafile.outputs),
};
writeFileSync(join(consumer, "browser-build.json"), JSON.stringify(metadata, null, 2) + "\n");
console.log(JSON.stringify(metadata));

if (process.argv.includes("--serve")) {
  const port = Number(process.env.INKSPAN_TEST_PORT ?? 8768);
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/" || path === "/denied") {
      res.setHeader("Content-Type", "text/html");
      res.setHeader(
        "Content-Security-Policy",
        `default-src 'self'; script-src 'self'${path === "/" ? " 'wasm-unsafe-eval'" : ""}`,
      );
      res.end(
        '<!doctype html><meta charset="utf-8"><title>Inkspan verification</title><script type="module" src="/browser-smoke.js"></script>',
      );
      return;
    }
    const file = files.get(path.slice(1));
    if (!file || !file.startsWith(outdir + sep)) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader("Content-Type", "text/javascript");
    res.end(readFileSync(file));
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`Browser verification ready on http://localhost:${port}`),
  );
}
