# `@caphub/cli`

Root CLI for Caphub capabilities.

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
caphub help places
```

## Run capabilities

```bash
caphub search '{"queries":["site:github.com awesome ai agents"]}'
```

```bash
caphub search-ideas '{"queries":["best robot vacuum"]}'
```

```bash
caphub shopping '{"queries":[{"q":"apple m5 pro","country":"th","language":"en"}]}'
```

```bash
caphub places '{"queries":["best pizza in Vienna"],"reviews":{"for":"top","sort_by":"newest"}}'
```
