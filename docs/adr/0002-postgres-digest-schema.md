---
type: ADR
id: "0002"
title: "Reuse Evolution Postgres with digest schema"
status: active
date: 2026-05-25
---

## Context

Evolution users already operate Postgres for message/contact persistence. WA Digest needs durable idempotent ingest, media status, transcripts, imports, and queue metadata.

## Decision

**WA Digest reuses the same Postgres instance as Evolution, but owns only a separate `digest` schema.**

## Options considered

- **Same Postgres, separate schema** (chosen): low operational friction; backed up with Evolution; clear ownership.
- **Separate Postgres**: cleaner isolation but unnecessary setup burden.
- **Local JSON/files only**: simple prototype but not reliable for concurrent webhook/worker processing.

## Consequences

- Migrations must never touch Evolution-owned schemas/tables.
- Wiping Evolution Postgres also wipes WA Digest history.
- Backfill can read Evolution tables while storing derived state separately.
