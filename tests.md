# tests.md

## AgentWeb end-to-end harness

The canonical repo-visible harness lives in:

- `tests/agentweb-e2e.ts`
- docs: `tests/README.md`

## Purpose

This harness runs the **real product flow**:

1. explorer run via `POST /api/agent/explore`
2. fetch generated `agents.json` + `explorer-meta`
3. head-to-head demo via `POST /api/agent/demo`
4. artifact + metric summary in `tests/output/`

## Run

```bash
npm run test:e2e -- https://mindark.com "What does this company do?" "How can I contact them?"
```

By default the harness kills any stale API on port 4001, rebuilds the backend, and starts a fresh API before the test.

Or directly:

```bash
cd api && npx tsx ../tests/agentweb-e2e.ts https://mindark.com "What does this company do?"
```

## Test philosophy

The final comparison must be fair:

- **LEFT** gets only the URL
- **RIGHT** gets `agents.json` and the same URL
- no extra prompting help for RIGHT
- no hidden hints or manual coaching

If the `agents.json` agent does not outperform the baseline in a meaningful way, the product did not earn the win.

## Current limitation

The harness automatically measures:
- completion
- timing
- tool calls
- error counts

It does **not** yet auto-grade answer quality/accuracy.

Use the saved transcripts/artifacts for manual review until a dedicated evaluator is built.
