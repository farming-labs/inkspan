import { build } from "esbuild";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ["scripts/reference-entry.cjs"],
  outfile: "generated/reference.js",
  platform: "neutral",
  mainFields: ["module", "main"],
  format: "esm",
  target: "es2022",
  bundle: true,
  minify: true,
  legalComments: "inline",
  metafile: true,
  write: false,
});
if (Object.values(result.metafile.outputs).some((output) => output.imports.length)) {
  throw new Error("The portable parser must bundle every runtime import.");
}

const licenses = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.includes("node_modules/")) continue;
  let dir = dirname(resolve(root, input));
  while (!existsSync(resolve(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Missing package manifest for " + input);
    dir = parent;
  }
  const manifest = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8"));
  const id = manifest.name + "@" + manifest.version;
  if (licenses.has(id)) continue;
  const names = readdirSync(dir)
    .filter((n) => /^(license|licence|copying|notice)([.-]|$)/i.test(n))
    .sort();
  if (!names.length) throw new Error("Missing bundled license for " + id);
  licenses.set(id, names.map((n) => readFileSync(resolve(dir, n), "utf8").trim()).join("\n\n"));
}
writeFileSync(
  resolve(root, "generated/JS-NOTICES.txt"),
  [...licenses.keys()]
    .sort()
    .map((id) => id + "\n" + licenses.get(id))
    .join("\n\n") + "\n",
);
writeFileSync(resolve(root, "generated/reference.js"), result.outputFiles[0].contents);
