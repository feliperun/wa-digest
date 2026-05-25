# Vision

WA Digest turns WhatsApp groups and chats into agent-ready text corpora.

The core use case is not "summarize one group." It is:

1. Capture messages from many WhatsApp groups/chats.
2. Transcribe audio and video into text.
3. Preserve provenance, timestamps, authors, and processing status.
4. Export structured corpora for an agent such as OpenClaw.
5. Let the private agent apply its own prompts, templates, tone, and editorial priorities.

## Non-goals

- Replacing Evolution API.
- Patching Evolution core.
- Promising complete historical media recovery through WhatsApp linked-device APIs.
- Embedding Felipe-specific or private summarization prompts.
- Becoming a general WhatsApp automation bot.

## Success Criteria

- A user can connect Evolution webhooks and see messages ingested idempotently.
- New audio/video media is archived and transcribed.
- Multiple groups can be grouped into collections and exported as corpus.
- Historical backfill is transparent about partial coverage.
- Official WhatsApp ZIP exports can be imported for historical local media.
- Agents receive structured facts and never need direct media access.
