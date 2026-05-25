#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import { migrateDatabase } from "./db/migrations.js";
import { startTranscriptionWorker } from "./worker/runner.js";

const ENV_TEMPLATE = `PORT=3897
DIGEST_API_TOKEN=change-me

EVOLUTION_BASE_URL=http://127.0.0.1:8080
EVOLUTION_API_KEY=change-me
EVOLUTION_INSTANCE=monitor

DATABASE_URL=postgresql://evo:change-me@127.0.0.1:5432/evolution
MEDIA_STORAGE_DIR=./data

TRANSCRIBER_PROVIDER=soniox
SONIOX_API_KEY=
SONIOX_MODEL=stt-async-v4

VISION_PROVIDER=metadata
OPENCLAW_COMPAT=true
MAX_CONCURRENT_TRANSCRIPTIONS=2
MAX_TRANSCRIPTION_MEDIA_BYTES=26214400
MEDIA_DOWNLOAD_TIMEOUT_MS=30000
TRANSCRIPTION_ALLOWED_MIME_TYPES=audio/*,video/*
MAX_TRANSCRIPTION_MINUTES_PER_DAY=0
`;

const COMPOSE_TEMPLATE = `services:
  wa-digest:
    image: ghcr.io/feliperun/wa-digest:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3897:3897"
    env_file:
      - .env
    environment:
      MEDIA_STORAGE_DIR: /data
    volumes:
      - wa_digest_data:/data

  wa-digest-worker:
    image: ghcr.io/feliperun/wa-digest:latest
    restart: unless-stopped
    command: ["node", "dist/cli.js", "worker"]
    env_file:
      - .env
    environment:
      MEDIA_STORAGE_DIR: /data
    volumes:
      - wa_digest_data:/data

  wa-digest-migrate:
    image: ghcr.io/feliperun/wa-digest:latest
    restart: "no"
    command: ["node", "dist/cli.js", "migrate"]
    env_file:
      - .env
    environment:
      MEDIA_STORAGE_DIR: /data
    volumes:
      - wa_digest_data:/data

volumes:
  wa_digest_data:
`;

const COLLECTIONS_TEMPLATE = `{
  "collections": {
    "tech": {
      "description": "Technology groups corpus",
      "chats": [
        "120363000000000000@g.us"
      ]
    }
  }
}
`;

function writeNew(filePath: string, content: string, force: boolean) {
  if (fs.existsSync(filePath) && !force) {
    return { filePath, status: "exists" };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return { filePath, status: fs.existsSync(filePath) ? "written" : "created" };
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function init() {
  const force = hasFlag("--force");
  const target = process.cwd();
  const files = [
    writeNew(path.join(target, ".env"), ENV_TEMPLATE, force),
    writeNew(path.join(target, "docker-compose.wa-digest.yml"), COMPOSE_TEMPLATE, force),
    writeNew(path.join(target, "collections.example.json"), COLLECTIONS_TEMPLATE, force)
  ];
  for (const file of files) {
    // eslint-disable-next-line no-console
    console.log(`${file.status} ${path.relative(target, file.filePath)}`);
  }
  // eslint-disable-next-line no-console
  console.log(`
Next steps:
  1. Edit .env with EVOLUTION_API_KEY, DATABASE_URL, DIGEST_API_TOKEN, and SONIOX_API_KEY.
  2. Configure Evolution webhook to POST /v1/evolution/webhook/<instance>.
  3. Start with: docker compose -f docker-compose.wa-digest.yml up -d
  4. Check with: npx wa-digest doctor
`);
}

async function doctor() {
  const config = loadConfig();
  const checks = [
    ["DIGEST_API_TOKEN", Boolean(config.apiToken)],
    ["DATABASE_URL", Boolean(config.databaseUrl)],
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

async function migrate() {
  const config = loadConfig();
  await migrateDatabase(config);
  // eslint-disable-next-line no-console
  console.log("ok migrated digest schema");
}

async function importWhatsappZip() {
  const zipPath = process.argv[3] || "";
  if (!zipPath) {
    // eslint-disable-next-line no-console
    console.error("Usage: wa-digest import-whatsapp-zip <archive.zip> --chat <jid-or-name> --instance <instance>");
    process.exitCode = 2;
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`WhatsApp ZIP import is planned but not implemented yet.

Requested archive: ${zipPath}

Target behavior:
  - parse _chat.txt
  - index attached media files
  - transcribe audio/video
  - deduplicate against Evolution-ingested messages
  - persist imported corpus with origin=whatsapp_zip_import`);
  process.exitCode = 2;
}

async function update() {
  const packageName = process.env.DIGEST_UPDATE_PACKAGE || "wa-digest";
  const manager = process.env.DIGEST_UPDATE_MANAGER || "npm";
  const args = manager === "pnpm" ? ["add", "-g", packageName] : ["install", "-g", packageName];
  const result = spawnSync(manager, args, { stdio: "inherit" });
  process.exitCode = result.status || 0;
}

async function worker() {
  const config = loadConfig();
  const running = await startTranscriptionWorker(config);
  // eslint-disable-next-line no-console
  console.log("wa-digest transcription worker started");
  const stop = async () => {
    await running.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}

async function main() {
  const command = process.argv[2] || "help";
  if (command === "init") return init();
  if (command === "doctor") return doctor();
  if (command === "migrate") return migrate();
  if (command === "worker") return worker();
  if (command === "import-whatsapp-zip") return importWhatsappZip();
  if (command === "update") return update();
  // eslint-disable-next-line no-console
  console.log(`Usage:
  wa-digest init [--force]
  wa-digest doctor
  wa-digest migrate
  wa-digest worker
  wa-digest import-whatsapp-zip <archive.zip> --chat <jid-or-name> --instance <instance>
  wa-digest update

npx examples:
  npx wa-digest@latest init
  npx wa-digest@latest doctor
  npx wa-digest@latest import-whatsapp-zip ./chat.zip --chat "CTO Real" --instance monitor

Environment:
  DIGEST_API_TOKEN, DATABASE_URL, EVOLUTION_BASE_URL, EVOLUTION_API_KEY, MEDIA_STORAGE_DIR
  TRANSCRIBER_PROVIDER=soniox, SONIOX_API_KEY
  VISION_PROVIDER=metadata|openai-compatible`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
