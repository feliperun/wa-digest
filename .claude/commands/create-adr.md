---
description: Create a new Architecture Decision Record under docs/adr/
---

Create a new ADR in `docs/adr/` documenting a structural decision for WA Digest.

## Steps

1. Read `docs/adr/README.md` for format, lifecycle rules, and the current index. Note the next available number.
2. Confirm the decision is ADR-worthy:
   - storage or queue strategy;
   - public API shape;
   - provider abstraction;
   - media/history guarantees;
   - distribution/auto-update strategy;
   - security/privacy boundary.
3. Create `docs/adr/NNNN-short-title.md` from `docs/adr/0000-template.md`.
4. Use `status: active` when the decision has been made; use `proposed` only for unresolved decisions.
5. Update the index table in `docs/adr/README.md`.
6. Update `docs/ARCHITECTURE.md` if active architecture changes.
7. Commit with a Conventional Commit, usually `docs(adr): NNNN <short title>`.

Never edit an active ADR except to mark it superseded and point to its replacement.
