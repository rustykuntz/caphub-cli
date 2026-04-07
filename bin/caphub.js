#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf8"));
const DEFAULT_API_URL = "https://api.caphub.io";
const CONFIG_DIR = resolve(os.homedir(), ".config", "caphub");
const CONFIG_PATH = resolve(CONFIG_DIR, "config.json");

const ROOT_HELP = `caphub

Caphub is hosted infrastructure for agent-ready capabilities such as search, query expansion, product shopping, and local places.

purpose: root CLI for Caphub agent capabilities
auth: CAPHUB_API_KEY env or ${CONFIG_PATH}
api: ${DEFAULT_API_URL}

commands:
  help                  explain the platform and command layout
  help <capability>     show capability-specific help from the API
  capabilities          list live capabilities with short descriptions
  auth                  show current login state
  auth login            open website login flow; stores api key locally after approval
  auth whoami           verify the current api key against the API
  auth logout           remove stored api key from local config
  <capability> <json>   run a capability directly, e.g. search, search-ideas, shopping, or places

agent workflow:
  1. caphub capabilities
  2. caphub help <capability>
  3. caphub auth login
  4. caphub <capability> '<json>'

recovery:
  no api key            caphub auth login
  invalid api key       generate a new key in https://caphub.io/dashboard/
  insufficient credits  top up in https://caphub.io/dashboard/
  bad json              caphub help <capability>
  capability unknown    caphub capabilities

examples:
  caphub auth
  caphub capabilities
  caphub auth login
  caphub auth login --api-key csk_live_...
  caphub help search
  caphub search '{"queries":["site:github.com awesome ai agents"]}'
  caphub shopping '{"queries":[{"q":"apple m5 pro","country":"th","language":"en"}]}'
  caphub places '{"queries":["best pizza in Vienna"],"reviews":{"for":"top","sort_by":"newest"}}'
`;

class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function readConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function getApiUrl() {
  const config = readConfig();
  return (
    process.env.CAPHUB_API_URL ||
    config.api_url ||
    DEFAULT_API_URL
  ).replace(/\/+$/, "");
}

function getApiKey() {
  const config = readConfig();
  return (
    process.env.CAPHUB_API_KEY ||
    config.api_key ||
    ""
  ).trim();
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function openUrl(url) {
  if (process.env.CAPHUB_NO_OPEN === "1") return false;

  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args = process.platform === "win32"
    ? ["/c", "start", "", url]
    : [url];

  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function readStdin() {
  return new Promise((resolveInput) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolveInput(data));
  });
}

async function fetchJson(url, { method = "GET", body, apiKey = "" } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["X-API-Key"] = apiKey;

  let resp;
  try {
    resp = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new ApiError(`request failed: ${error.message}`, 0, null);
  }

  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(`non-JSON response from ${url} (HTTP ${resp.status})`, resp.status, null);
  }

  if (!resp.ok) {
    throw new ApiError(data?.error || `HTTP ${resp.status}`, resp.status, data);
  }

  return data;
}

async function waitForEnterToOpen(url) {
  if (process.env.CAPHUB_NO_OPEN === "1") return false;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    await rl.question("Press Enter to open the browser login page, or Ctrl+C to cancel.");
  } finally {
    rl.close();
  }
  return openUrl(url);
}

function parseFlag(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1) return "";
  return args[idx + 1] || "";
}

function buildRecoveryHints(error, context = {}) {
  const hints = [];
  const capability = context.capability || "<capability>";
  const message = String(error?.message || "").toLowerCase();
  const status = Number(error?.status || 0);

  if (status === 401 || message.includes("missing x-api-key header")) {
    hints.push("login: caphub auth login");
  }

  if (status === 403 || message.includes("invalid api key")) {
    hints.push("generate a new key in https://caphub.io/dashboard/");
    hints.push("login again: caphub auth login --api-key csk_live_...");
  }

  if (status === 402 || message.includes("insufficient credits")) {
    hints.push("top up credits in https://caphub.io/dashboard/");
    hints.push("check account state: caphub auth whoami");
  }

  if (
    status === 400 ||
    message.includes("queries array is required") ||
    message.includes("unsupported function") ||
    message.includes("input must be valid json") ||
    message.includes("input json is required")
  ) {
    hints.push(`capability contract: caphub help ${capability}`);
  }

  if (message.includes("request failed:")) {
    hints.push(`api url: ${getApiUrl()}`);
    hints.push(`health: curl -sS ${getApiUrl()}/health`);
  }

  if (!hints.length) {
    hints.push("discover capabilities: caphub capabilities");
    hints.push(`capability contract: caphub help ${capability}`);
  }

  return hints;
}

function failWithHints(message, error, context = {}) {
  const lines = [`Error: ${message}`];
  const hints = buildRecoveryHints(error, context);
  if (hints.length) {
    lines.push("", "next:");
    for (const hint of hints) lines.push(`  - ${hint}`);
  }
  fail(lines.join("\n"));
}

function sleep(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function printCapabilities(payload) {
  const lines = [
    "caphub capabilities",
    "",
    "Live capabilities available through the current API.",
    "Use 'caphub help <capability>' before first use.",
    "",
  ];
  for (const capability of payload.capabilities || []) {
    lines.push(`/${capability.capability} - ${capability.purpose}`);
    if (capability.credits) lines.push(`  credits: ${capability.credits}`);
    if (capability.limits?.max_queries_per_request) lines.push(`  max queries: ${capability.limits.max_queries_per_request}`);
    if (capability.endpoint) lines.push(`  endpoint: ${capability.endpoint}`);
    lines.push("");
  }
  process.stdout.write(lines.join("\n"));
}

function printCapabilityHelp(payload) {
  const title = payload.capability === "search"
    ? "caphub web search"
    : payload.capability === "search-ideas"
      ? "caphub search ideas"
      : payload.capability === "shopping"
        ? "caphub product shopping"
        : payload.capability === "places"
          ? "caphub places"
          : `caphub ${payload.capability}`;
  const requestExample = payload.capability === "search"
    ? `caphub search '{"queries":["site:github.com awesome ai agents","awesome lists agents","codex awesome lists"]}'`
    : payload.capability === "shopping"
      ? `caphub shopping '{"queries":["apple m5 pro"]}'`
      : payload.capability === "places"
        ? `caphub places '{"queries":["best pizza in Vienna"]}'`
        : `caphub ${payload.capability} '${JSON.stringify(payload.input_contract)}'`;
  const configuredRequestExample = payload.capability === "search"
    ? `caphub search '{"queries":[{"q":"EV discounts Thailand","country":"th","language":"en","from_time":"week"}]}'`
    : payload.capability === "shopping"
      ? `caphub shopping '{"queries":[{"q":"apple m5 pro","country":"th","language":"en"}]}'`
      : payload.capability === "places"
        ? `caphub places '{"queries":["best pizza in Vienna"],"reviews":{"for":"top","sort_by":"newest"}}'`
        : null;
  const responseShape = payload.capability === "search"
    ? {
        queries: [
          {
            q: "string",
            country: "optional string",
            language: "optional string",
            from_time: "optional string",
          },
        ],
        results: [
          {
            query: "string",
            items: [
              {
                title: "string",
                link: "string",
                snippet: "string",
                date: "optional string",
              },
            ],
          },
        ],
        total_usage: {
          total_credits_used: "number",
          credits_remaining: "number",
        },
        billing: {
          credits_used: "number",
        },
      }
    : payload.capability === "shopping"
      ? {
          queries: [
            {
              q: "string",
              country: "optional string",
              language: "optional string",
            },
          ],
          results: [
            {
              query: "string",
              items: [
                {
                  title: "string",
                  source: "string",
                  link: "string",
                  price: "string",
                  rating: "optional number",
                  rating_count: "optional number",
                  product_id: "optional string",
                  image_url: "optional http URL",
                },
              ],
            },
          ],
          total_usage: {
            total_credits_used: "number",
            credits_remaining: "number",
          },
          billing: {
            credits_used: "number",
          },
        }
    : payload.capability === "places"
      ? {
          queries: [{ query: "string", reviews: { mode: "none | top | all", sort_by: "mostRelevant | newest | highestRating | lowestRating" } }],
          results: [
            {
              query: "string",
              places: [
                {
                  position: "number",
                  title: "string",
                  address: "string",
                  latitude: "optional number",
                  longitude: "optional number",
                  rating: "optional number",
                  rating_count: "optional number",
                  price_level: "optional string",
                  category: "optional string",
                  cid: "optional string",
                  reviews: [
                    {
                      rating: "number",
                      iso_date: "optional string",
                      snippet: "string",
                      user: "optional reviewer object",
                      media: "optional image array",
                    },
                  ],
                },
              ],
            },
          ],
          total_usage: {
            total_credits_used: "number",
            credits_remaining: "number",
          },
          billing: {
            credits_used: "number",
          },
        }
    : payload.output_contract;
  const parameters = payload.parameters || {};
  const searchParameterOrder = [
    "queries",
    "queries[] as string",
    "queries[] as object",
    "queries[].q",
    "queries[].country",
    "queries[].language",
    "queries[].from_time",
    "max_queries",
    "include_meta",
    "include_result_meta",
  ];
  const shoppingParameterOrder = [
    "queries",
    "queries[] as string",
    "queries[] as object",
    "queries[].q",
    "queries[].country",
    "queries[].language",
    "max_queries",
    "include_meta",
    "include_result_meta",
  ];
  const placesParameterOrder = [
    "queries",
    "queries[] as string",
    "reviews.for",
    "reviews.sort_by",
    "max_queries",
    "include_meta",
    "include_result_meta",
  ];
  const preferredParameterOrder = payload.capability === "search"
    ? searchParameterOrder
    : payload.capability === "shopping"
      ? shoppingParameterOrder
      : payload.capability === "places"
        ? placesParameterOrder
        : null;
  const orderedParameterEntries = preferredParameterOrder
    ? [
        ...preferredParameterOrder
          .filter((name) => Object.prototype.hasOwnProperty.call(parameters, name))
          .map((name) => [name, parameters[name]]),
        ...Object.entries(parameters).filter(([name]) => !preferredParameterOrder.includes(name)),
      ]
    : Object.entries(parameters);
  const parameterLines = orderedParameterEntries.map(([name, description]) => `- ${name}: ${description}`);
  const lines = [
    title,
    "-".repeat(title.length),
    "",
    `description: ${payload.purpose}`,
    "",
    `endpoint: ${payload.endpoint}`,
    `method: ${payload.method}`,
    payload.credits ? `credits: ${payload.credits}` : null,
    payload.limits?.max_queries_per_request ? `limits: max ${payload.limits.max_queries_per_request} queries per request` : null,
    "",
    "request:",
    "format:",
    `caphub ${payload.capability} '<request>'`,
    "",
    "default request form:",
    requestExample,
    configuredRequestExample ? "" : null,
    configuredRequestExample ? "configured request form:" : null,
    configuredRequestExample,
    parameterLines.length ? "" : null,
    parameterLines.length ? "configuration:" : null,
    ...parameterLines,
    "",
    "response:",
    JSON.stringify(responseShape, null, 2),
    payload.notes_for_agents?.length ? "" : null,
    payload.notes_for_agents?.length ? "notes:" : null,
    ...(payload.notes_for_agents || []).map((note) => `- ${note}`),
    "",
    "common recovery:",
    "- auth missing: caphub auth login",
    "- auth invalid: generate a new key in https://caphub.io/dashboard/",
    "- low credits: top up in https://caphub.io/dashboard/",
    `- bad payload: caphub help ${payload.capability}`,
  ].filter((line) => line !== null && line !== undefined);
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function commandHelp(args) {
  const apiUrl = getApiUrl();
  const capability = args[0];
  if (!capability) {
    process.stdout.write(ROOT_HELP);
    return;
  }

  const payload = await fetchJson(`${apiUrl}/v1/${capability}/help`);
  printCapabilityHelp(payload);
}

async function commandCapabilities(args) {
  const apiUrl = getApiUrl();
  const payload = await fetchJson(`${apiUrl}/v1/help`);
  if (args.includes("--json")) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  printCapabilities(payload);
}

async function commandAuth(args) {
  const sub = args[0];
  const config = readConfig();

  if (!sub) {
    const apiKey = getApiKey();
    if (!apiKey) {
      process.stdout.write([
        "caphub auth",
        "",
        "status: not logged in",
        "",
        "next:",
        "  - caphub auth login",
        "  - or for headless/cloud agents: caphub auth login --api-key csk_live_...",
        "",
      ].join("\n"));
      return;
    }

    try {
      const payload = await fetchJson(`${getApiUrl()}/v1/me`, { apiKey });
      process.stdout.write([
        "caphub auth",
        "",
        "status: logged in",
        `email: ${payload.user.email}`,
        `user_id: ${payload.user.id}`,
        `credits_remaining: ${payload.total_usage.credits_remaining}`,
        `total_credits_used: ${payload.total_usage.total_credits_used}`,
        "",
        "next:",
        "  - caphub capabilities",
        "  - caphub help search",
        "",
      ].join("\n"));
      return;
    } catch (error) {
      failWithHints("stored credentials are not valid", error, { capability: "search" });
    }
  }

  if (sub === "login") {
    const explicitApiKey = parseFlag(args, "--api-key");
    if (!explicitApiKey && !args.includes("--api-key")) {
      const apiUrl = getApiUrl();
      const started = await fetchJson(`${apiUrl}/v1/auth/cli/start`, { method: "POST", body: {} });
      process.stdout.write([
        "caphub auth login",
        "",
        "This will open Caphub in your browser to approve CLI login.",
        `code: ${started.code}`,
        `expires_in_seconds: ${started.expires_in_seconds}`,
        `url: ${started.approval_url}`,
        "",
      ].join("\n"));

      const opened = await waitForEnterToOpen(started.approval_url);
      process.stdout.write([
        process.env.CAPHUB_NO_OPEN === "1"
          ? "browser_open: disabled by CAPHUB_NO_OPEN=1"
          : `browser_open: ${opened ? "attempted" : "not attempted"}`,
        opened ? "If the browser did not open, copy the URL above." : "Open the URL above in your browser.",
        "Waiting for website approval...",
        "",
      ].join("\n"));

      const deadline = Date.now() + Number(started.expires_in_seconds || 600) * 1000;
      const intervalMs = Number(started.poll_interval_seconds || 2) * 1000;
      while (Date.now() < deadline) {
        const polled = await fetchJson(`${apiUrl}/v1/auth/cli/poll`, {
          method: "POST",
          body: {
            session_id: started.session_id,
            poll_token: started.poll_token,
          },
        });

        if (polled.status === "approved" && polled.api_key) {
          writeConfig({
            ...config,
            api_key: polled.api_key,
            api_url: apiUrl,
          });
          process.stdout.write(`${JSON.stringify({ ok: true, config_path: CONFIG_PATH, api_url: apiUrl }, null, 2)}\n`);
          return;
        }

        await sleep(intervalMs);
      }

      fail("Error: login approval timed out.\n\nnext:\n  - rerun: caphub auth login\n  - or open https://caphub.io/dashboard/");
    }

    const apiKey = explicitApiKey || getApiKey();
    const apiUrl = parseFlag(args, "--api-url") || getApiUrl();
    if (!apiKey) fail("Error: auth login requires --api-key or CAPHUB_API_KEY.\n\nnext:\n  - caphub auth login --api-key csk_live_...");
    writeConfig({
      ...config,
      api_key: apiKey,
      api_url: apiUrl,
    });
    process.stdout.write(`${JSON.stringify({ ok: true, config_path: CONFIG_PATH, api_url: apiUrl }, null, 2)}\n`);
    return;
  }

  if (sub === "whoami") {
    const apiKey = getApiKey();
    if (!apiKey) fail(`Error: no api key configured.\n\nnext:\n  - caphub auth login --api-key csk_live_...\n  - or set api_key in ${CONFIG_PATH}`);
    const payload = await fetchJson(`${getApiUrl()}/v1/me`, { apiKey });
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (sub === "logout") {
    const next = { ...config };
    delete next.api_key;
    writeConfig(next);
    process.stdout.write(`${JSON.stringify({ ok: true, config_path: CONFIG_PATH }, null, 2)}\n`);
    return;
  }

  fail("Error: auth commands are: login, whoami, logout.");
}

async function commandCapability(capability, args) {
  const apiKey = getApiKey();
  if (!apiKey) {
    fail(
      `Error: no api key configured for capability "${capability}".\n\nnext:\n  - caphub auth login --api-key csk_live_...\n  - then retry: caphub ${capability} '<json>'\n  - contract: caphub help ${capability}`
    );
  }

  if (args[0] === "--help" || args[0] === "help") {
    await commandHelp([capability]);
    return;
  }

  const arg = args[0];
  const rawInput = arg ?? (process.stdin.isTTY ? "" : await readStdin());
  if (!rawInput.trim()) {
    fail(`Error: input JSON is required.\n\nnext:\n  - caphub help ${capability}\n  - then run: caphub ${capability} '<json>'`);
  }

  let body;
  try {
    body = JSON.parse(rawInput);
  } catch {
    fail(`Error: input must be valid JSON.\n\nnext:\n  - caphub help ${capability}\n  - pass exactly one JSON object`);
  }

  if (!("function" in body)) body.function = capability;

  const payload = await fetchJson(`${getApiUrl()}/v1/${capability}`, {
    method: "POST",
    apiKey,
    body,
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    await commandHelp(args.slice(1));
    return;
  }

  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  if (cmd === "capabilities") {
    await commandCapabilities(args.slice(1));
    return;
  }

  if (cmd === "auth") {
    await commandAuth(args.slice(1));
    return;
  }

  await commandCapability(cmd, args.slice(1));
}

await main().catch((error) => {
  const cmd = process.argv[2];
  const capability = cmd && !["help", "--help", "-h", "capabilities", "auth", "--version", "-v", "version"].includes(cmd)
    ? cmd
    : undefined;
  failWithHints(error.message || "unknown error", error, { capability });
});
