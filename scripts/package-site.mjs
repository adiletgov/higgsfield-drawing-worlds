import { mkdir, copyFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
// Keep dist/ in the archive path: Sites discovers dist/server/index.js.
// The root manifest supplies the deployment's own project ID and storage bindings.
const staging = ".site-package";
await mkdir(`${staging}/.openai`, { recursive: true });
await copyFile("dist/.openai/hosting.json", `${staging}/.openai/hosting.json`);
try {
  execFileSync(
    "tar",
    [
      "-czf",
      "drawing-worlds-site.tar.gz",
      "-C",
      staging,
      ".openai/hosting.json",
      "-C",
      "..",
      "dist",
    ],
    { stdio: "inherit" },
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}
console.log("Created drawing-worlds-site.tar.gz from the current build.");
