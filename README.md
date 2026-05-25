# WA Digest

Open source companion extension for [Evolution API](https://github.com/EvolutionAPI/evolution-api) that turns WhatsApp text and media webhooks into agent-ready JSON timelines.

It is designed for OpenClaw/Ford, but the HTTP API is generic and can be consumed by any agent runtime.

## Architecture

- Runs beside Evolution API. It does not patch or fork Evolution.
- Receives `MESSAGES_UPSERT` webhooks.
- Stores normalized messages, media state, and transcriptions in Postgres schema `digest`.
- Uses `pg-boss` in the same schema for transcription jobs.
- Resolves media from webhook base64, `mediaUrl`, or public Evolution `getBase64` endpoints when available.
- Marks old encrypted media as unavailable when Evolution cannot expose the bytes through public APIs.
- Transcribes audio through a provider facade. The initial provider is Soniox via the official Node SDK.
- Treats video as audio for transcription. Frame analysis and image OCR are outside the Fase 1 path.
- Returns structured corpus/timeline JSON. It does not perform final synthesis or summarization.

Project docs:

- [Architecture](docs/ARCHITECTURE.md)
- [Vision](docs/VISION.md)
- [Plan](docs/PLAN.md)
- [ADRs](docs/adr/README.md)
- [Agent instructions](AGENTS.md)

## Quick Start

Bootstrap a local config with `npx`:

```bash
npx wa-digest@latest init
```

Then edit `.env` and run with Docker:

```bash
docker compose -f docker-compose.wa-digest.yml up -d
```

For local development from a clone:

```bash
cp .env.example .env
npm install
npm run build
npm run migrate
npm start
```

Run the transcription worker in a separate process:

```bash
npm run worker
```

Healthcheck:

```bash
curl http://127.0.0.1:3897/healthz
```

Doctor:

```bash
npx wa-digest@latest doctor
```

`npx` is intended for setup, diagnostics, migrations, and one-shot imports. Use Docker, a pinned package install, or a global install for a long-running service/worker.

## Evolution Webhook

Configure Evolution to send `MESSAGES_UPSERT` to:

```text
POST http://<digest-host>:3897/v1/evolution/webhook/<instance>
Authorization: Bearer <DIGEST_API_TOKEN>
```

For future media reliability, prefer one of:

- `webhookBase64=true` for simpler setups.
- S3/MinIO media storage in Evolution and `mediaUrl` in events for lower webhook payload pressure.

Historical media is only recoverable if Evolution exposes a public endpoint that can return it or if it was already persisted in storage.

## API

```text
GET /v1/groups
GET /v1/groups/:jid/digest?hours=24
GET /v1/chats/:jid/timeline?hours=24
GET /v1/messages/:messageId/analysis
```

All `/v1/*` endpoints require:

```text
Authorization: Bearer <DIGEST_API_TOKEN>
```

`GET /v1/groups/:jid/digest` returns a structured corpus package with `timeline`, per-item media/transcription status, and aggregate `status.state` (`complete` or `partial`). It intentionally omits final summary fields; downstream agents own synthesis.

## Transcription Providers

Set:

```text
TRANSCRIBER_PROVIDER=soniox
SONIOX_API_KEY=...
SONIOX_MODEL=stt-async-v4
```

The provider facade also reserves `openai-compatible`, `mistral`, `voxtral`, `local`, and `noop`.

Soniox SDK reference: https://soniox.com/docs/sdk/node-SDK

## Docker

```bash
docker compose -f examples/docker-compose.yml --env-file .env up -d
```

Before first start or after upgrades, run the idempotent migration:

```bash
docker compose -f examples/docker-compose.yml --env-file .env run --rm wa-digest node dist/cli.js migrate
```

The example starts the HTTP service and a separate worker, and includes Watchtower for auto-updates when using the GHCR image.

## OpenClaw

Use the included skill instructions in `openclaw/skills/wa-digest/SKILL.md`. The skill should call this service and consume the JSON timeline/digest; it should not download or transcribe WhatsApp media directly.
