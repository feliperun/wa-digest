---
type: ADR
id: "0007"
title: "npx for onboarding, not runtime"
status: active
date: 2026-05-25
---

## Context

WA Digest should be easy for Evolution users to try without cloning the repo. Node users expect `npx <package>` for setup and diagnostics, but long-running daemons should be pinned and auditable.

## Decision

**WA Digest is distributed as an npm package with a `wa-digest` binary for `npx` onboarding and one-shot commands. Docker remains the recommended runtime for the service/worker.**

## Options considered

- **npx for setup/diagnostics/imports, Docker for runtime** (chosen): low-friction onboarding without making production startup depend on npm registry resolution.
- **npx for everything including daemon runtime**: convenient but less deterministic and harder to audit.
- **Docker only**: reliable runtime but higher onboarding friction.

## Consequences

- The package exposes `wa-digest` as the primary binary and keeps `digestctl` as an alias.
- Commands such as `init`, `doctor`, `migrate`, and `import-whatsapp-zip` should be safe to run via `npx`.
- Docs must distinguish one-shot CLI usage from production runtime.
