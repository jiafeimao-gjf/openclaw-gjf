# Local Development Guide

This guide covers everything you need to know for developing OpenClaw locally.

## Environment Setup

### Runtime Requirements

- **Node 22+** (both Node and Bun paths are kept functional)
- **Package manager**: `pnpm` (preferred) or `bun install`

### Install Dependencies

```bash
pnpm install
```

### Pre-commit Hooks

```bash
prek install
```

This runs the repo verification flow, including `pnpm check`.

---

## Daily Development Commands

### Run CLI in Dev Mode

```bash
pnpm openclaw ...  # bun mode
pnpm dev          # dev mode
```

### Build and Checks

| Command | Description |
|---------|-------------|
| `pnpm build` | Type-check + build |
| `pnpm tsgo` | TypeScript checks |
| `pnpm check` | Lint + format checks |
| `pnpm format` | Format check (oxfmt --check) |
| `pnpm format:fix` | Format fix (oxfmt --write) |

> Local agent/dev shells use lower-memory `OPENCLAW_LOCAL_CHECK=1` by default. Set `OPENCLAW_LOCAL_CHECK=0` in CI/shared runs.

### Testing

```bash
pnpm test                  # Vitest (forks mode)
pnpm test:coverage         # With coverage report
pnpm test -- <path> -t "<filter>"  # Targeted test
```

**Memory pressure?** Use conservative config:

```bash
OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test
```

**Important**: Vitest must use `forks` only. Do not introduce other pool variants (`threads`, `vmThreads`, `vmForks`, etc.).

### Live Tests (Requires Real Keys)

```bash
OPENCLAW_LIVE_TEST=1 pnpm test:live       # OpenClaw-only tests
LIVE=1 pnpm test:live                       # Includes provider live tests
OPENCLAW_LIVE_TEST_QUIET=0 pnpm test:live   # Full logs
```

Docker live tests:

```bash
pnpm test:docker:live-models
pnpm test:docker:live-gateway
pnpm test:docker:onboard   # Onboarding E2E
```

---

## Verification Gates

| Gate | What's Included |
|------|----------------|
| **Local Dev Gate** | `pnpm check` + targeted tests |
| **Landing Gate** | `pnpm check` + `pnpm test` + `pnpm build` (when touching build/packaging/lazy-loading/published surfaces) |
| **CI Gate** | Workflow-specific (`check`, `check-additional`, `build-smoke`, etc.) |

### Fast Commit

Skip pre-commit hook's full `format` + `check`:

```bash
FAST_COMMIT=1 git commit ...
```

Use this only when you've already run equivalent checks manually. Does not apply to CI.

### Hard Rule

If your change affects **build output, packaging, lazy-loading/module boundaries, or published surfaces**, you **must** run `pnpm build` and it **must pass** before pushing to `main`.

---

## Project Structure

```
src/
├── cli/           # CLI wiring
├── commands/      # Command implementations
├── provider-web.ts # Web provider
├── infra/         # Infrastructure
├── media/         # Media pipeline
└── channels/      # Core channel implementations

tests:   colocated *.test.ts
docs:   docs/ (images, queue, Pi config)
dist/:  build output
```

---

## Coding Standards

- **Language**: TypeScript (ESM), strict typing, avoid `any`
- **Formatting/Linting**: Oxlint + Oxfmt
- **Schemas**: Prefer `zod` for external boundaries (config, webhooks, CLI output, persisted JSON, third-party APIs)
- **Error handling**: Use `Result<T, E>` or closed error-code unions. Avoid branching on `error: string` or `reason: string`
- **File size**: Target under ~700 LOC; split when it improves clarity or testability

---

## Dynamic Import Guardrails

- **Do not** mix `await import("x")` and static `import ... from "x"` for the same module in production paths
- When lazy loading is needed, create a dedicated `*.runtime.ts` boundary file that re-exports from the module
- After refactors touching lazy-loading/module boundaries, run `pnpm build` and check for `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings before submitting

---

## macOS Gateway Debugging

The Gateway currently runs only as the menubar app. **Start/stop via the OpenClaw Mac app, not ad-hoc tmux sessions.**

```bash
# Check gateway status
launchctl print gui/$UID | grep openclaw

# Restart via app or script
./scripts/restart-mac.sh

# View logs
./scripts/clawlog.sh -f            # Follow tail
./scripts/clawlog.sh -c <category> # Filter by category
```

---

## Key Paths

| Purpose | Path |
|---------|------|
| Credentials | `~/.openclaw/credentials/` |
| Pi sessions | `~/.openclaw/sessions/` |
| Gateway log | `/tmp/openclaw-gateway.log` |

Rerun `openclaw login` if logged out.

---

## Further Reading

- Architecture overview: [Architecture](/concepts/architecture)
- Plugin development: [Building Plugins](/plugins/building-plugins)
- Testing guide: [Testing](/help/testing)
- Debugging: [Debugging](/help/debugging)
- Channel docs: [Channels](/channels)
