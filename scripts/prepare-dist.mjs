import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, "dist");
const distJsDir = path.join(distDir, "js");
const sourceAudioWorklet = path.join(repoRoot, "src", "audio", "audio-processors.js");
const targetAudioWorklet = path.join(distJsDir, "processors.js");
const sourceDataDir = path.join(repoRoot, "DATA");
const targetDataDir = path.join(distDir, "DATA");
const shouldCopy = (sourcePath) => path.basename(sourcePath) !== ".DS_Store";

await mkdir(distJsDir, { recursive: true });
await cp(sourceAudioWorklet, targetAudioWorklet);
await cp(sourceDataDir, targetDataDir, { recursive: true, filter: shouldCopy });
await writeFile(path.join(distDir, ".nojekyll"), "");
