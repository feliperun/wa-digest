# Architecture Decision Records

This folder contains Architecture Decision Records (ADRs) for WA Digest: the record of why structural choices were made.

## Format

Each ADR is a markdown file with YAML frontmatter. Use [`0000-template.md`](0000-template.md).

```markdown
---
type: ADR
id: "NNNN"
title: "Short decision title"
status: proposed        # proposed | active | superseded | retired
date: YYYY-MM-DD
superseded_by: "NNNN"  # only if status: superseded
---
```

## Rules

- One decision per file.
- File name: `NNNN-short-title.md`, monotonic numbering.
- Once `active`, never edit except to mark superseded.
- When superseded: update `status: superseded`, add `superseded_by`, and link from the new ADR.
- `docs/ARCHITECTURE.md` reflects active decisions only.

## Index

| ID | Title | Status |
|----|-------|--------|
| [0001](0001-companion-service-not-evolution-core.md) | Companion service, not Evolution core patch | active |
| [0002](0002-postgres-digest-schema.md) | Reuse Evolution Postgres with `digest` schema | active |
| [0003](0003-corpus-not-synthesis.md) | WA Digest emits corpus, not synthesis | active |
| [0004](0004-historical-media-best-effort-and-zip-import.md) | Historical media is best-effort; ZIP import is the reliable archive path | active |
| [0005](0005-transcription-provider-facade.md) | Transcription provider facade with Soniox first | active |
| [0006](0006-postgres-backed-worker-queue.md) | Postgres-backed worker queue before Redis | active |
| [0007](0007-npx-for-onboarding-not-runtime.md) | npx for onboarding, not runtime | active |
| [0008](0008-operational-transcription-limits-and-status.md) | Operational transcription limits and explicit partial status | active |
