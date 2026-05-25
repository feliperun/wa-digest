---
type: ADR
id: "0004"
title: "Historical media is best-effort; ZIP import is the reliable archive path"
status: active
date: 2026-05-25
---

## Context

Evolution/Baileys operates as a WhatsApp Web/Multi-device linked device. It does not have direct access to the phone's local WhatsApp database/cache or the official "Export Chat" flow.

## Decision

**Historical media through Evolution/Baileys is best-effort. Future media capture is the reliable path, and official WhatsApp ZIP export import is the preferred path for historical local media when available.**

## Options considered

- **Best-effort backfill + ZIP import** (chosen): honest about protocol limits while preserving a practical archive path.
- **Promise complete history sync**: false guarantee; linked devices cannot force phone-local media export.
- **Direct phone automation**: out of scope, fragile, and platform-specific.

## Consequences

- Every historical media item needs explicit status (`metadata_only`, `unavailable_from_whatsapp`, `imported_from_zip`, etc.).
- Documentation must avoid promising complete old-media recovery.
- ZIP import needs dedup heuristics because official exports do not carry Evolution `messageId`.
