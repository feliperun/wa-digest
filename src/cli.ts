#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { loadConfig } from "./config.js";

async function doctor() {
  const config = loadConfig();
  const checks = [
    ["DIGEST_API_TOKEN", Boolean(config.apiToken)],
    ["MEDIA_STORAGE_DIR", Boolean(config.mediaStorageDir)],
    ["TRANSCRIBER_PROVIDER", Boolean(config.transcriberProvider)],
    ["SONIOX_API_KEY", config.transcriberProvider !== "soniox" || Boolean(config.sonioxApiKey)],
    ["EVOLUTION_BASE_URL", Boolean(config.evolutionBaseUrl)],
    ["EVOLUTION_API_KEY", Boolean(config.evolutionApiKey)],
    ["VISION_PROVIDER", Boolean(config.visionProvider)],
    ["VISION_API_KEY", config.visionProvider !== "openai-compatible" || Boolean(config.visionApiKey)]
  ] as const;

  let ok = true;
  for (const [name, pass] of checks) {
    if (!pass) ok = false;
    // eslint-disable-next-line no-console
    console.log(`${pass ? "ok" : "missing"} ${name}`);
  }
  process.exitCode = ok ? 0 : 1;
}

async function update() {
  const packageName = process.env.DIGEST_UPDATE_PACKAGE || "evolution-media-digest";
  const manager = process.env.DIGEST_UPDATE_MANAGER || "npm";
  const args = manager === "pnpm" ? ["add", "-g", packageName] : ["install", "-g", packageName];
  const result = spawnSync(manager, args, { stdio: "inherit" });
  process.exitCode = result.status || 0;
}

async function main() {
  const command = process.argv[2] || "help";
  if (command === "doctor") return doctor();
  if (command === "update") return update();
  // eslint-disable-next-line no-console
  console.log(`Usage:
  digestctl doctor
  digestctl update

Environment:
  DIGEST_API_TOKEN, EVOLUTION_BASE_URL, EVOLUTION_API_KEY, MEDIA_STORAGE_DIR
  TRANSCRIBER_PROVIDER=soniox, SONIOX_API_KEY
  VISION_PROVIDER=metadata|openai-compatible`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
