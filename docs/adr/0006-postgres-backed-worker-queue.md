---
type: ADR
id: "0006"
title: "Postgres-backed worker queue before Redis"
status: active
date: 2026-05-25
---

## Context

Webhook ingestion must be fast and durable. Media transcription can be slow, expensive, and rate-limited. Evolution users already operate Postgres; adding Redis increases setup burden.

## Decision

**WA Digest should prefer a Postgres-backed queue such as `pg-boss` for the MVP. Redis/BullMQ requires a future ADR if Postgres-backed queueing becomes insufficient.**

## Options considered

- **Postgres-backed queue** (chosen): fewer dependencies; transactional persistence; good enough for MVP load.
- **BullMQ + Redis**: strong queue ergonomics but adds another service.
- **In-process queue**: simple but loses jobs on restart and cannot scale workers cleanly.

## Consequences

- Webhook flow is validate -> persist message/job -> return 2xx.
- Worker concurrency and daily transcription caps are first-class config.
- Queue schema must stay in the `digest` ownership boundary.
