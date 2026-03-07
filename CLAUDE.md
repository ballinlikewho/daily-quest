# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (root)
```bash
npm run dev        # Start Vite dev server
npm run build      # Build for production
npm run lint       # Run ESLint
npm run preview    # Build + run via wrangler dev (requires wrangler auth)
npm run deploy     # Build + deploy to Cloudflare Pages
```

### Worker (./worker/)
```bash
cd worker
npm run dev        # Run worker locally via wrangler
npm run deploy     # Deploy worker to Cloudflare Workers
```

## Architecture

This is a **daily D20 fantasy adventure game** deployed on Cloudflare. There is no backend framework — it's a React SPA plus a standalone Cloudflare Worker.

### Two separate deployments

**Frontend** (`/src/`, root `wrangler.jsonc`): React + Vite SPA deployed to Cloudflare Pages as a static site with SPA fallback routing. All game UI and mechanics are client-side.

**Worker** (`/worker/src/index.js`, `worker/wrangler.toml`): A Cloudflare Worker that:
- Calls the Anthropic API (`claude-haiku-4-5-20251001`) to generate the daily quest JSON
- Caches the result in Cloudflare KV (`QUEST_KV`) for 48 hours
- Exposes `GET /tree?date=YYYY-M-D` to serve the quest tree
- Has a cron trigger at 4:50 UTC (11:50 PM EST) to pre-generate the next day's quest
- Falls back to on-demand generation if KV cache misses

The frontend fetches from the worker via `VITE_WORKER_URL` env var.

### Game mechanics (all in `src/App.jsx`)

The entire game is a single React component (`DailyQuest`) with no sub-components split into separate files. Phases: `intro` → `generating` → `choosing` → `rolling` → (repeat) → `done`.

**Daily determinism**: Quest type and tone are seeded from today's date using a simple hash (`seededPick`), so everyone gets the same quest type/tone each day. The actual quest content (story, choices, outcomes) is LLM-generated and cached.

**Quest tree structure**: The worker generates a complete JSON tree for the entire 5-turn quest upfront. Each turn has 3 choices (Easy/Normal/Risky), each with 4 outcome narratives (success, failure, crit_success, crit_failure). Turn 5 has special `endings` keyed by performance bucket.

**Momentum system**: Roll modifiers carry between turns — normal successes stack +1 flat bonus (max +5), risky success grants advantage, nat 20 grants advantage, nat 1 gives disadvantage, etc.

**Dynamic Final DC**: The turn-5 DC starts at 10 and is adjusted by each prior turn's difficulty/outcome (`DC_DELTA`). Clamped to [4, 20]. The ending narrative is chosen based on the performance bucket (`dominated`/`solid`/`mixed`/`struggled`/`disaster`) and victory/defeat.

**Scoring**: Points per successful turn (Easy=1, Normal=2, Risky=3, crit multiplies by 1.5x), +3 for victory. Tiered S/A/B/C/F based on score percentage.

**Instant defeat edge case**: 3 Easy failures before turn 5 triggers an immediate defeat.

### Environment variables
- `VITE_WORKER_URL` — URL of the deployed Cloudflare Worker (set in Cloudflare Pages env or `.env.local`)
- `ANTHROPIC_API_KEY` — set as a Cloudflare Worker secret (`wrangler secret put ANTHROPIC_API_KEY`)

### Fonts
Google Fonts are loaded inline via `<link>` tags in JSX render: `Cinzel` (headers/UI) and `IM Fell English` (narrative text).
