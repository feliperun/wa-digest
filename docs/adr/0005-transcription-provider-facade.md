---
type: ADR
id: "0005"
title: "Transcription provider facade with Soniox first"
status: active
date: 2026-05-25
---

## Context

Audio/video transcription is the core media capability, but provider choice may change by language quality, cost, privacy, or availability.

## Decision

**WA Digest exposes a `TranscriberController` facade and ships Soniox as the first concrete provider, with room for Mistral/Voxtral, OpenAI-compatible, and local providers.**

## Options considered

- **Provider facade** (chosen): keeps provider lock-in low and makes failures/test doubles manageable.
- **Soniox hardcoded everywhere**: fast initial path but expensive to unwind.
- **Only local transcription**: avoids APIs but raises CPU/setup cost, especially on older Macs.

## Consequences

- Provider-specific SDK types must stay behind adapter boundaries.
- Tests should mock the facade, not vendor SDKs.
- Cost/duration metadata belongs in persisted transcription records.
