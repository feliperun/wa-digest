---
type: ADR
id: "0008"
title: "Operational transcription limits and explicit partial status"
status: active
date: 2026-05-25
---

## Context

Transcription creates external-provider cost and worker pressure. The public corpus API also needs to say why a digest is incomplete without adding synthesis or hiding failed media.

## Decision

**WA Digest applies configurable transcription limits before provider calls and reports refusals as structured corpus status.**

Limits include maximum media bytes, media download timeout, audio/video MIME allowlist, and an initial daily transcription budget by instance. Refused media is marked `rejected` with an explicit reason. The digest aggregate keeps `status.state` as `complete` or `partial` and adds `status.reason` for machine-readable partial causes such as `processing`, `failed_items`, and `partial_media_unavailable`.

## Options considered

- **Explicit limits and partial reasons** (chosen): keeps cost bounded and makes incomplete corpus responses observable.
- **Provider-only limits**: simpler, but downloads and provider requests can still consume resources before failure.
- **Silent skips**: unacceptable because corpus consumers need provenance and completeness signals.

## Consequences

- Workers can reject items without retrying when policy limits are hit.
- Temporary download failures can still use queue retry/backoff.
- The first daily budget implementation is conservative and can be refined once providers expose reliable media duration.
