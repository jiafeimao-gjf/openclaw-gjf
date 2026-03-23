# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **docs/** directory — the Mintlify documentation site for OpenClaw (docs.openclaw.ai). For core codebase guidance, see the root `AGENTS.md`.

## Docs Structure

- `docs/*.md` — English source docs (editable)
- `docs/zh-CN/` — Chinese translation (generated, do not edit directly)
- `docs/ja-JP/` — Japanese translation (generated, do not edit directly)
- `docs/.i18n/` — i18n config: glossaries and translation memory
- `docs/docs.json` — Mintlify site configuration
- `docs/images/` — Static images hosted in docs
- `docs/assets/` — Logos and other assets

## Linking Conventions

- Internal links: root-relative paths, no `.md` extension (e.g., `[Config](/configuration)`)
- Section anchors: append `#anchor` to root-relative paths (e.g., `[Hooks](/configuration#hooks)`)
- External links: use full `https://docs.openclaw.ai/...` URLs
- Headings: avoid em dashes (`—`) and apostrophes (`'`) — they break Mintlify anchor links

## i18n Workflow

1. Update English docs first
2. Update glossary: `docs/.i18n/glossary.<lang>.json` (source → target term mappings)
3. Run `scripts/docs-i18n` to generate translations
4. Apply targeted fixes only if instructed; do not hand-edit `zh-CN/` or `ja-JP/` files

Glossary format:
```json
{
  "source": "troubleshooting",
  "target": "故障排除",
  "ignore_case": true,
  "whole_word": false
}
```

Translation memory: `docs/.i18n/<lang>.tm.jsonl` (auto-generated cache, do not edit)

## Mintlify

Docs are built and deployed via Mintlify. The site config lives in `docs/docs.json`. When adding new top-level sections, update the Mintlify navigation accordingly.
