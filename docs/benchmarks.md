# Section extraction and audience projection

Inkspan extracted **744 human sections in 140 ms** and **272 agent sections in 34 ms**. Both corpora contain 53 pages from Farming Labs Docs. The same tarball's portable parser took 584 ms and 138 ms. Every measured run checked the complete output, including exact section text and line ranges.

## Standalone package

Each cell shows median / p95 in milliseconds after module import. The control repeats the portable implementation in a separate process. The prototype column shows the earlier Rust implementation measured during the same run.

| Corpus | Portable JS | Node Inkspan | JS control | Rust prototype | Speedup vs JS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Human pages, 773,306 bytes | 584.33 / 639.20 | 139.81 / 158.07 | 588.01 / 645.77 | 245.45 / 264.53 | 4.18× |
| Agent sidecars, 119,397 bytes | 137.72 / 177.07 | 34.15 / 37.74 | 132.26 / 198.82 | 40.27 / 52.29 | 4.03× |
| Reference page, 144 sections | 208.03 / 243.48 | 50.73 / 51.98 | 210.16 / 233.32 | 80.66 / 84.93 | 4.10× |
| One literal heading | 9.74 / 10.27 | 0.29 / 1.07 | 9.50 / 9.83 | 6.54 / 7.28 | 33.81× |
| One JSX expression | 12.94 / 15.40 | 21.29 / 22.60 | 13.14 / 13.68 | 13.73 / 15.41 | 0.61× |

The literal-heading case is `# Install`. Including module import, its median was 11.61 ms on Node and 18.84 ms with the portable parser. The expression case is `# Example\n\n<Widget items={rows.map(row => row.id)} />`. This path initializes Wasm and then delegates JavaScript syntax to the reference parser. Including import, it took 32.80 ms on Node and 22.33 ms with the portable parser.

## Farming Labs Docs integration

The baseline used the production build of Farming Labs Docs at revision `6d442beb8cc94378a46b063fbab79c48ece769ed`. The candidate installed the integrated docs tarball into a clean npm consumer. The section adapter preserves docs-specific anchors, nested ranges, and generated-contract behavior. The audience adapter indexes static wrappers and shares tag discovery between adjacent human and agent projections.

| Operation, 53 pages | Original docs median / p95 (ms) | With Inkspan | Original control | Speedup |
| --- | ---: | ---: | ---: | ---: |
| Extract human sections | 674.65 / 767.56 | 157.23 / 163.80 | 682.13 / 716.93 | 4.29× |
| Extract agent sections | 112.20 / 154.17 | 29.19 / 38.79 | 109.56 / 135.28 | 3.84× |
| Discover audience tags | 846.15 / 1000.72 | 671.42 / 829.49 | 822.70 / 1104.90 | 1.26× |
| Project both audiences | 2072.57 / 4776.65 | 1200.98 / 3435.66 | 2070.51 / 5614.24 | 1.73× |
| First filesystem MCP scan | 2436.58 / 3870.64 | 1269.29 / 3164.95 | 2274.40 / 6579.17 | 1.92× |

With only one-source reuse added to the original JavaScript, the two-audience projection took 1387.26 / 4090.53 ms and the scan took 1754.70 / 3035.03 ms. Adding Inkspan on top of reuse improved their medians by 1.16× and 1.38×, respectively. Scan tail latency was noisy. The general readable-text API uses the JavaScript parser. These measurements cover Node extraction, audience projection, and scanning. Browser indexing, full site builds, and search latency were outside this benchmark.

## Reproduce

Node 24.21.0, Apple M1 arm64, macOS 26.2. Each operation ran in a fresh process after loading its inputs. Each variant had one warmup and nine recorded samples, with interleaved, rotated order and an independent repeat of the baseline. The p95 is the largest of nine samples. Hashing complete outputs happened outside the timed region.

For your own content, run `node benchmark/corpus.mjs ./content sections` or replace `sections` with `components`. Each command emits all samples and their output hashes. To reproduce the package workloads with the original human and agent projections, run the following from the Inkspan checkout:

```sh
bench_dir=$(mktemp -d)
git clone https://github.com/farming-labs/docs.git "$bench_dir/docs"
git -C "$bench_dir/docs" checkout --detach 6d442beb8cc94378a46b063fbab79c48ece769ed
pnpm --dir "$bench_dir/docs" --filter @farming-labs/docs... install --frozen-lockfile --ignore-scripts
pnpm --dir "$bench_dir/docs" --filter @farming-labs/docs build
node --input-type=module - "$bench_dir" <<'JS'
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const dir = process.argv[2];
const rootDir = join(dir, "docs");
const { createFilesystemDocsMcpSource } = await import(
  pathToFileURL(join(rootDir, "packages/docs/dist/mcp.mjs"))
);
const pages = await createFilesystemDocsMcpSource({
  rootDir, contentDir: "website/src/app/docs",
}).getPages();
for (const [name, field] of [["human", "rawContent"], ["agent", "agentRawContent"]]) {
  writeFileSync(join(dir, name + ".json"), JSON.stringify(pages.map(page => ({
    source: page[field], format: "mdx", ignoreElements: ["Prompt"],
  }))));
}
JS
node benchmark/corpus.mjs "$bench_dir/human.json" sections
node benchmark/corpus.mjs "$bench_dir/agent.json" sections
```

The generic harness compares the two shipping paths and an independent JavaScript control. The integration measurements additionally included the previous packed prototype and docs-specific operations.
