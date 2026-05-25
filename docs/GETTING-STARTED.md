# Getting Started

## Current Status

WA Digest now has the Fase 1 persistence and worker path: webhook ingest stores normalized messages in Postgres schema `digest`, enqueues audio/video transcription through `pg-boss`, and exposes a structured corpus endpoint without final synthesis.

Start with:

1. Read [PLAN.md](PLAN.md), especially "Estado atual do repositório" and "Por onde começar".
2. Read [AGENTS.md](../AGENTS.md).
3. Run the local checks.
4. Keep changes aligned with the Postgres/worker boundary.

## Prerequisites

- Node.js 20+
- Evolution API
- Postgres reachable through `DATABASE_URL`
- Soniox API key for the default transcription provider
- `ffmpeg` for video/audio extraction

## Local Development

```bash
npm install
cp .env.example .env
npm run migrate
npm run dev
```

Run the worker in another shell when testing transcription:

```bash
npm run worker
```

Healthcheck:

```bash
curl http://127.0.0.1:3897/healthz
```

## Checks

```bash
npm run lint
npm test
npm run build
sentrux check .
```

## Architecture Docs

- [Plan](PLAN.md)
- [Architecture](ARCHITECTURE.md)
- [Vision](VISION.md)
- [ADRs](adr/README.md)

## Agent Workflow

Agents should read [AGENTS.md](../AGENTS.md) before changing code.
