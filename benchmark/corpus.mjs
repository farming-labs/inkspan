import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { cpus, release } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
function digest(values) {
  const json = JSON.stringify(values, (_, value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, value[key]]),
    );
  });
  return createHash("sha256").update(json).digest("hex");
}

function* markdown(dir) {
  for (const file of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  )) {
    if (file.name.startsWith(".") || file.name === "node_modules") continue;
    const path = join(dir, file.name);
    if (file.isDirectory()) yield* markdown(path);
    else if (file.isFile() && /\.mdx?$/i.test(file.name)) yield path;
  }
}
if (process.argv[2] === "--worker") {
  const { indexMarkdown, parseMarkdownSections } = await import("../index.js");
  const input = process.argv[3];
  const files = statSync(input).isFile()
    ? JSON.parse(readFileSync(input, "utf8"))
    : [...markdown(input)].map((path) => ({
        format: /\.mdx$/i.test(path) ? "mdx" : "md",
        source: readFileSync(path, "utf8"),
      }));
  if (!files.length) throw Error("Pass a nonempty corpus of Markdown or MDX documents.");
  const start = performance.now();
  const values = files.map(({ format, source, ignoreElements }) => {
    try {
      return process.argv[4] === "components"
        ? indexMarkdown(source, { format, components: true })
        : parseMarkdownSections(source, { format, ignoreElements });
    } catch (error) {
      if (error.code !== "ERR_MARKDOWN_SYNTAX") throw error;
      return {
        error: error.code,
        reason: error.cause.reason,
        line: error.cause.line,
        column: error.cause.column,
      };
    }
  });
  const ms = performance.now() - start;
  console.log(
    JSON.stringify({
      ms,
      files: files.length,
      errors: values.filter((v) => v.error).length,
      hash: digest(values),
    }),
  );
} else {
  const [, , dir, operation = "sections"] = process.argv;
  if (!dir || !["sections", "components"].includes(operation))
    throw Error("Run node benchmark/corpus.mjs <directory-or-json> [sections|components].");
  const variants = ["portable", "node", "control"],
    samples = [];
  let expected;
  for (let round = -1; round < 9; round++) {
    const offset = (round + 1) % 3,
      order = [...variants.slice(offset), ...variants.slice(0, offset)];
    if (round % 2 === 0) order.reverse();
    for (const variant of order) {
      const flags = variant === "node" ? [] : ["--conditions=workerd"];
      const sample = JSON.parse(
        execFileSync(process.execPath, [...flags, here, "--worker", resolve(dir), operation]),
      );
      expected ??= sample.hash;
      assert.equal(sample.hash, expected, "Output differs between implementations.");
      samples.push({ round, variant, ...sample });
    }
  }
  const timings = Object.fromEntries(
    variants.map((v) => {
      const t = samples
        .filter((s) => s.round >= 0 && s.variant === v)
        .map((s) => s.ms)
        .sort((a, b) => a - b);
      return [v, { median: t[4], p95: t[8] }];
    }),
  );
  console.log(
    JSON.stringify(
      {
        operation,
        node: process.version,
        cpu: cpus()[0].model,
        os: release(),
        warmups: 1,
        rounds: 9,
        timings,
        speedup: timings.portable.median / timings.node.median,
        samples,
      },
      null,
      2,
    ),
  );
}
