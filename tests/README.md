# AgentWeb E2E Harness

This folder contains the repository-visible end-to-end harness for the AgentWeb explorer + head-to-head agent demo flow.

## What it does

`agentweb-e2e.ts` runs the full product path:

1. Starts an explorer run through the real API route: `POST /api/agent/explore`
2. Waits for `agents.json` + `explorer-meta`
3. Runs the final head-to-head comparison through the real demo route: `POST /api/agent/demo`
4. Saves all events, summaries, and generated artifacts to `tests/output/*.json`

This means we are testing the actual product flow, not an ad-hoc curl sequence.

## Run it

From the repo root:

```bash
cd api && npx tsx ../tests/agentweb-e2e.ts https://mindark.com "What does this company do?" "How can I contact them?"
```

Or use the root npm script:

```bash
npm run test:e2e -- https://mindark.com "What does this company do?" "How can I contact them?"
```

## Requirements

- Docker available
- valid `ANTHROPIC_API_KEY`
- local `.env.local` at the repo root
- explorer routes enabled
- demo routes enabled

By default the harness will kill any stale API on port 4001, rebuild the API image, and start a fresh backend before the test run. Pass `--no-restart-api` only if you intentionally want to use an already-running API.

## Output

Each run writes a JSON artifact to:

```text
tests/output/<domain>-<timestamp>.json
```

The artifact includes:
- explorer SSE events
- fetched `agents.json`
- fetched `explorer-meta`
- demo SSE events for each question
- per-question timing/tool-call summary
- automatic LEFT vs RIGHT metric comparison

## Success criterion

The business goal is simple:

- **LEFT** = baseline agent with only the URL
- **RIGHT** = AgentWeb-enhanced agent using `agents.json` + same URL

No extra prompting help. No hidden hints. No cheating.

A successful AgentWeb run is one where the RIGHT agent performs better than the LEFT agent.

### Important note

The current harness automatically scores:
- completion
- timing
- tool call counts
- error counts

But **answer quality still needs human review** until we build a dedicated evaluator.

So today the harness gives:
- automatic operational metrics
- full transcripts/artifacts for manual judgment

## Why this exists

This is here so future agents do not need to reconstruct the full test cycle from chat history every time.
