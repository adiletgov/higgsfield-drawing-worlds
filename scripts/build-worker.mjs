import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
await build({
  entryPoints: ["src/server/index.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
await mkdir("dist/.openai", { recursive: true });
let manifest = { d1: "DB", r2: "MEDIA" };
try {
  manifest = {
    ...manifest,
    ...JSON.parse(await readFile(".openai/hosting.json", "utf8")),
  };
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await writeFile(
  "dist/.openai/hosting.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("Built Sites Worker, client, and storage manifest.");
