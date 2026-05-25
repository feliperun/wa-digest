# Getting Started

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
