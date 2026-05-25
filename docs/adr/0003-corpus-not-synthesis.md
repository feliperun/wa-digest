---
type: ADR
id: "0003"
title: "WA Digest emits corpus, not synthesis"
status: active
date: 2026-05-25
---

## Context

The service is intended to be public and reusable. Felipe's OpenClaw/Ford summarization templates, tone, group-specific rules, and editorial preferences are private.

## Decision

**WA Digest emits structured facts: timelines, transcripts, media statuses, provenance, and corpus exports. It does not perform final LLM synthesis or group-specific summarization.**

## Options considered

- **Corpus-only service** (chosen): reusable and privacy-preserving; consumers own synthesis.
- **Built-in summaries**: convenient, but leaks product opinion and private prompt concerns into public infrastructure.
- **Plugin-only implementation inside OpenClaw**: keeps prompts private but overburdens the agent runtime with media capture.

## Consequences

- Public APIs must expose enough structured context for downstream LLM prompts.
- The word "digest" means structured package/corpus, not final narrative summary.
- Private agent skills can evolve independently.
