# `@caphub/cli`

Root CLI for Caphub capabilities.

Caphub helps agents research products, compare offers, find the best places, learn a topic, get the latest financial news, and more without dragging full websites into context.

Capabilities can run server-side on Caphub infrastructure or locally from this machine. Server-side actions may consume credits. Local actions return `local: true` and `billing.credits_used: 0`.

## Install

```bash
npm install -g @caphub/cli
```

Or run without install:

```bash
npx @caphub/cli help
```

## Auth

Open the website approval flow:

```bash
caphub auth login
```

For headless/cloud agents, put the key in the platform secret manager and expose it as:

```bash
CAPHUB_API_KEY=csk_live_...
```

## Discovery

```bash
caphub help
caphub capabilities
caphub help search
caphub help shopping
caphub help maps
caphub help weather
caphub reddit --help
caphub youtube --help
```

## Run capabilities

```bash
caphub search '{"queries":["best AI agent frameworks 2026"]}'
```

```bash
caphub search-ideas '{"queries":["best robot vacuum"]}'
```

```bash
caphub shopping '{"queries":["apple m5 pro"],"country":"th","language":"en"}'
```

```bash
caphub places '{"queries":["best pizza in Vienna"]}'
```

```bash
caphub places '{"cids":["13290506179446267841"],"sort_by":"newest"}'
```

## Hybrid Reddit capability

Use local reads when the agent already knows the target subreddit, post, or user:

```bash
caphub reddit feed '{"subreddit":"worldnews","sort":"new","limit":25}'
```

```bash
caphub reddit post '{"id":"1kaqi3k","comments":"top","comment_limit":20,"comment_depth":3}'
```

```bash
caphub reddit user '{"username":"Ok-Contribution9043","type":"comments","limit":10}'
```

Use server-side Reddit search when the agent needs to discover relevant Reddit posts by topic:

```bash
caphub reddit search '{"query":"qwen3 8b","subreddit":"LocalLLaMA","time":"month","limit":10}'
```

## Hybrid YouTube capability

Use local transcript reads when the agent already knows the target video and is running on a normal machine with outbound internet access:

```bash
caphub youtube transcript '{"video_url":"GmE4JwmFuHk"}'
```

```bash
caphub youtube transcript '{"video_url":"https://youtu.be/GmE4JwmFuHk","language":"en","send_metadata":true}'
```

Use the server fallback when local transcript extraction is unavailable:

```bash
caphub youtube transcript-server '{"video_url":"GmE4JwmFuHk","send_metadata":true}'
```

Server transcript fallback costs `2` Caphub credits. Local transcript extraction remains free.

Use server-side endpoints for discovery and channel or playlist traversal:

```bash
caphub youtube search '{"queries":["qwen3 8b review"],"limit":10}'
```

```bash
caphub youtube channel-resolve '{"input":"@TED"}'
```

```bash
caphub youtube channel-search '{"channel":"@TED","q":"ai","limit":10}'
```

```bash
caphub youtube channel-videos '{"channel":"@TED"}'
```

```bash
caphub youtube channel-latest '{"channel":"@TED"}'
```

```bash
caphub youtube playlist-videos '{"playlist":"PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"}'
```

## Finance news

Use server-side finance news when the agent needs the latest coverage for a stock ticker:

```bash
caphub finance news '{"queries":["NVDA","AAPL"]}'
```

```bash
caphub finance news '{"queries":["BRK.B"],"limit":20}'
```

## Maps

Use maps when the agent needs to find the best places in an area, compare options, or inspect reviews:

```bash
caphub maps search '{"query":"pizza","area":"Chiang Mai","zoom":11}'
```

```bash
caphub maps search '{"query":"coworking","area":"Koh Phangan"}'
```

Use `maps places` when the query already contains the location:

```bash
caphub maps places '{"queries":["best pizza in Vienna"]}'
```

Use `maps reviews` when you already have one or more place CIDs:

```bash
caphub maps reviews '{"cids":["13290506179446267841"],"sort_by":"newest"}'
```

## Weather

Use server-side weather forecast when the agent needs rain and temperature for a place before making plans or recommendations:

```bash
caphub weather forecast '{"location":"Koh Phangan","days":3}'
```

```bash
caphub weather forecast '{"location":"Bangkok","days":1}'
```
