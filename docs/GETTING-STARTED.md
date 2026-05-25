# Getting Started

## Current Status

WA Digest is currently a scaffold/prototype. It is useful for validating the HTTP shape, webhook parsing, provider facades, packaging, and docs harness. The production Fase 1 work starts by replacing the local JSON store with Postgres schema `digest` and moving media processing into a `pg-boss` worker.

Start with:

1. Read [PLAN.md](PLAN.md), especially "Estado atual do repositório" and "Por onde começar".
2. Read [AGENTS.md](../AGENTS.md).
3. Run the local checks.
4. Implement the Fase 1 persistence/worker path.

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
npm run dev
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
