import { spawn } from "node:child_process";
import { mkdir, copyFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stage = join(homedir(), "Library", "Caches", "Visro-build");
const output = join(root, "release");
const directoryOnly = process.argv.includes("--dir");
const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} failed (${code}).`)),
    );
  });
await mkdir(stage, { recursive: true });
await mkdir(output, { recursive: true });
// Documents can be iCloud-backed. Keep all app files outside it while signing.
await run(process.execPath, [
  join(root, "node_modules", "electron-builder", "cli.js"),
  "--mac",
  ...(directoryOnly ? ["dir"] : ["dmg", "zip"]),
  "--arm64",
  `--config.directories.output=${stage}`,
]);
const app = join(stage, "mac-arm64", "Visro.app");
await run("/usr/bin/codesign", [
  "--verify",
  "--deep",
  "--strict",
  "--verbose=2",
  app,
]);
for (const file of await readdir(stage))
  if (/\.(dmg|zip|blockmap)$/.test(file))
    await copyFile(join(stage, file), join(output, file));
console.log(`Visro app: ${app}\nInstallers: ${output}`);
