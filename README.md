# AgentWeb

**Turn any website into an operating manual for AI agents.**

AI agents are increasingly how customers find products, compare prices, and get answers. But agents can't read your website the way humans do — they hallucinate prices, follow dead links, and miss entire sections of your site.

`agents.json` solves this. It's a machine-readable document that describes exactly how your website works: search endpoints, navigation structure, product filtering, contact channels — all verified against the live site. Any AI agent that reads it can immediately operate your site correctly.

**Live demo:** [agentweb.se](https://agentweb.se)

## How It Works

1. You provide a URL
2. An AI explorer browses your site in a real Chrome browser, discovers what it can do, and verifies each capability
3. You get an `agents.json` — a complete operating manual any AI agent can use

No manual work. No setup on your end. The explorer handles everything.

## With vs Without agents.json

Real results from eu.gymshark.com:

| | Without | With agents.json |
|---|---|---|
| **Task** | "Find seamless sports bras in blue under £30" | Same question |
| **What happened** | 11 fetches, 7 returned 404. Couldn't extract product data | Used the search API directly. Found 3 matching products with prices and availability |
| **Time** | 54s | 24s |

## Getting Started

You need at least one AI provider API key:

- [Anthropic](https://console.anthropic.com) (Claude)
- [OpenAI](https://platform.openai.com) (GPT, o-series)
- [Google](https://aistudio.google.com) (Gemini)

### Quick start (npx)

```bash
npx @agentweb-se/agentweb
```

The CLI will prompt you for an API key if one isn't set. It clones the repo, installs dependencies (including Chrome for the explorer), and starts the app at [localhost:3000](http://localhost:3000).

### Docker

```bash
git clone https://github.com/agentweb-se/agentweb.git
cd agentweb
cp .env.example .env.local    # add your API key(s)
docker compose up
```

### Manual

```bash
git clone https://github.com/agentweb-se/agentweb.git
cd agentweb
cp .env.example .env.local    # add your API key(s)

cd api && npm install && npm run dev    # terminal 1
cd web && npm install && npm run dev    # terminal 2
```

## Architecture

```
web/    Next.js 14 frontend (port 3000)
api/    Hono backend with headless Chrome (port 4001)
```

### API

| Endpoint | Description |
|---|---|
| `POST /api/agent/explore` | Run the AI explorer on a URL (SSE stream) |
| `POST /api/agent/demo` | Side-by-side comparison: with vs without agents.json |
| `GET /api/site/:domain/agents` | Retrieve the generated agents.json |

## Status

Active development. The core explorer works and produces agents.json documents that measurably improve agent performance on real websites. We're continuing to improve coverage and quality.

## Contributing

Contributions welcome — the codebase is TypeScript throughout. See open issues or submit a PR.

```bash
npm run test    # unit tests (api/)
npm run lint    # lint (web/)
```

## License

[GPL-3.0](LICENSE)

---

[agentweb.se](https://agentweb.se) · Built by [MindArk](https://www.mindark.com/) · [info@agentweb.se](mailto:info@agentweb.se)
