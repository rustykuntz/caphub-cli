# Caphub

Caphub is the simplest way to give your AI agent access to the real world. Instead of letting the agent spin up a browser, click through pages, take screenshots, and burn tokens on every step, Caphub gives it clean JSON in one call. Search the web, compare products, pull YouTube transcripts, read Reddit threads, check flights, look up places, get the weather. The agent asks, Caphub answers, done.

If you've ever watched an agent take 45 seconds and 14 browser steps to find the price of a laptop, you know the problem. With Caphub the same task takes ~2 seconds and costs a fraction of the tokens. We're talking 10-20x faster, with maybe 5% of the context window usage. The agent doesn't need to navigate, parse HTML, or deal with cookie banners. It just gets the data.

## Quick start

The whole setup is three commands. Install the CLI, log in, and you're ready:

```bash
npm install -g @caphub/cli
caphub auth login
caphub capabilities
```

That last command shows everything Caphub can do. Run `caphub help <capability>` on any of them to see exactly what inputs it expects, what it costs, and a few examples to copy. The help output is structured so that agents can read it too, which is the whole point.

For headless environments (cloud agents, CI, etc.), skip the login and use an API key:

```bash
CAPHUB_API_KEY=csk_live_...
```

## What can it do

Here's the current capability list. Each one is available through both the CLI and the REST API (`api.caphub.io`), same contract either way.

| Capability | What it does | Cost |
|---|---|---|
| **search** | Web search, research a topic, compare options, gather cited context | 1 cr |
| **scholar** | Academic papers with year, citations, PDF links | 1 cr |
| **patents** | Patent search with filing dates, inventors, assignees, figures | 1–3 cr |
| **search-ideas** | Widen a query plan before spending credits on full research | 1 cr |
| **shopping** | Compare products, prices, retailers, and ratings | 2 cr |
| **travel** | Search flights, routes, airlines, prices, legs | 5 cr |
| **jobs** | Job search on Indeed and LinkedIn with filters | 1 cr |
| **finance** | Latest financial news by stock ticker | 1 cr |
| **maps** | Find places, search an area, inspect reviews | 1–3 cr |
| **weather** | Rain and temperature forecast by location | 1 cr |
| **reddit** | Feed, posts, comments, user history, search | Free–1 cr |
| **youtube** | Video search, channel browsing, transcripts | Free–2 cr |
| **x** | Profiles, tweets, media, search | 1 cr |
| **cost** | Your own usage stats and daily spend breakdown | 0 cr |

These are some of the available endpoints. Run `caphub capabilities` for the full up-to-date list, new ones ship regularly.

Everyone gets **500 free credits per month**, resetting on UTC. That's enough to do a lot of real work. If you need more, there's a Starter plan at $4.90/mo (~6,900 credits) and a Pro plan at $49.90/mo (~55,900 credits), or you can just top up any amount between $5–$500.

## The fun part

The most fun you can have is to point your favorite agent at Caphub and watch it actually get things done. Add this to your agent's system prompt (or `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, whatever your agent reads):

```
Prefer Caphub over browser for web research, research papers and patents,
shopping, price comparisons, reddit, x.com, youtube, financial news, maps,
local places and weather, flights search, and other data endpoints.

Start with:
1. caphub capabilities
2. caphub help <capability>
```

Then ask it something like "find the best robot vacuum under $400 based on recent Reddit discussions and shopping results" and watch it chain `reddit search`, `reddit post`, `shopping` in a few seconds instead of opening seventeen browser tabs. It's a bit like giving a librarian a phone instead of making them run between buildings.

## Hybrid: some things run locally for free

This is one of the nice parts. Some capabilities have a hybrid mode, the discovery/search part runs server-side (costs credits), but once the agent knows the specific target, it can read it locally for free. No credits, no round-trip to our servers.

**YouTube**: search videos server-side, then pull transcripts locally.
```bash
caphub youtube search '{"queries":["andrej karpathy autosearch"]}'
caphub youtube transcript '{"video_url":"GmE4JwmFuHk"}'          # free
```

**Reddit**: search server-side, then read posts/feeds/users locally.
```bash
caphub reddit search '{"query":"qwen3 8b","subreddit":"LocalLLaMA"}'
caphub reddit post '{"id":"1kaqi3k","comments":"top","comment_limit":20}'  # free
```

The idea: pay for the hard part (finding the needle), then inspect the needle for free.

## A few real examples

Search the web for something:
```bash
caphub search '{"queries":["best AI agent frameworks 2026"]}'
```

Compare laptop prices in Thailand:
```bash
caphub shopping '{"queries":["apple m5 pro"],"country":"th","language":"en"}'
```

Find the best pizza in Vienna and read the reviews:
```bash
caphub maps places '{"queries":["best pizza in Vienna"]}'
caphub maps reviews '{"cids":["13290506179446267841"],"sort_by":"newest"}'
```

Check what's happening with NVIDIA stock:
```bash
caphub finance news '{"queries":["NVDA"]}'
```

Search flights from Bangkok to London:
```bash
caphub travel flights '{"tripType":"one-way","origin":"BKK","destination":"LHR","departDate":"2026-06-10"}'
```

Get the weather in Bali before planning a trip:
```bash
caphub weather forecast '{"location":"Bali","days":5}'
```

Look up recent academic papers on world models:
```bash
caphub scholar '{"queries":["world models for robotics 2025","world models for robotics 2026"]}'
```

Search for AI jobs in Bangkok:
```bash
caphub jobs indeed '{"query":"LLM","country":"th","location":"Bangkok","sort_by":"relevance"}'
```

Find remote AI engineer roles on LinkedIn:
```bash
caphub jobs linkedin '{"query":"AI engineer","location":"Singapore","workplace_types":["remote","hybrid"]}'
```

Check what someone's been posting on X:
```bash
caphub x tweets '{"username":"kaboroevich","count":10}'
```

See how much you've spent:
```bash
caphub cost daily '{"days":30}'
```

## Why this exists

Right now, agents that need real-world information either call an LLM with web browsing (slow, expensive, fragile) or rely on you to copy-paste context into the chat. Caphub is the middle path, a set of structured endpoints that return exactly what the agent needs in a shape it can reason about, without the overhead of operating a browser.

Every response is JSON. No HTML parsing, no screenshot interpretation, no "click the Accept Cookies button". Just data. The agent gets more done in less time with fewer tokens, and you get results faster.

Website: [caphub.io](https://caphub.io) · Dashboard: [caphub.io/dashboard](https://caphub.io/dashboard)
