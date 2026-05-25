---
type: ADR
id: "0001"
title: "Companion service, not Evolution core patch"
status: active
date: 2026-05-25
---

## Context

WA Digest must be usable by people running Evolution API without maintaining a fork. Updating Evolution should not delete local changes or require reapplying patches.

## Decision

**WA Digest runs as a companion service beside Evolution API and integrates through webhooks, public APIs, storage URLs, and the Evolution Postgres database. It must not patch Evolution core for normal operation.**

## Options considered

- **Companion service** (chosen): installable independently; survives Evolution upgrades; works for OpenClaw and other agents.
- **Evolution core patch**: powerful but brittle; conflicts with updates and public adoption.
- **Direct Baileys replacement**: more control but duplicates session/state and loses Evolution as the backup backbone.

## Consequences

- Easier installation and upgrades.
- Clear open-source boundary.
- Media/history recovery is limited to what Evolution/public surfaces expose.
- A future optional adapter may be added only behind a separate ADR.
