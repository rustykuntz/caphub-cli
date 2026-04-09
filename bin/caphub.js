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
const LOCAL_FETCH_TIMEOUT_MS = 16000;
const REDDIT_BASE_URL = "https://www.reddit.com";
const YOUTUBE_BASE_URL = "https://www.youtube.com";

const LOCAL_FETCH_HEADERS = {
  Accept: "application/json, text/html;q=0.9, */*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "max-age=0",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
};

const ROOT_HELP = `caphub

Caphub is hosted and local infrastructure for agent-ready capabilities such as search, query expansion, product shopping, local places, Reddit, YouTube, finance news, and maps search.

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
  reddit search <json>  search Reddit posts server-side; costs credits
  reddit feed <json>    fetch subreddit feed locally; free
  reddit post <json>    fetch post content and comments locally; free
  reddit user <json>    fetch user posts or comments locally; free
  youtube search <json> search YouTube videos server-side; costs credits
  youtube transcript <json> fetch YouTube transcript locally; free
  finance news <json>   fetch recent stock ticker news server-side; costs credits
  maps search <json>    search Google Maps in a named area server-side; costs credits

agent workflow:
  1. caphub capabilities
  2. caphub help <capability>
  3. caphub auth login
  4. caphub <capability> '<json>' or caphub reddit|youtube|finance|maps <action> '<json>'

execution:
  server-side           runs on CapHub infrastructure and may consume credits
  local                 runs from this machine and consumes 0 credits
  hybrid                combines both under one capability

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
  caphub search '{"queries":["best AI agent frameworks 2026"]}'
  caphub shopping '{"queries":["apple m5 pro"],"country":"th","language":"en"}'
  caphub places '{"queries":["best pizza in Vienna"]}'
  caphub places '{"cids":["13290506179446267841"],"sort_by":"newest"}'
  caphub reddit search '{"query":"qwen3 8b","subreddit":"LocalLLaMA"}'
  caphub reddit feed '{"subreddit":"worldnews","sort":"new","limit":25}'
  caphub youtube search '{"queries":["qwen3 8b review"],"limit":10}'
  caphub youtube transcript '{"video_url":"GmE4JwmFuHk"}'
  caphub finance news '{"queries":["NVDA","AAPL"]}'
  caphub maps search '{"query":"pizza","area":"Chiang Mai","zoom":11}'
`;

const REDDIT_HELP = `caphub reddit

Hybrid Reddit capability.

Reddit search runs server-side through CapHub and costs credits. Reddit feed, post, and user reads run locally from this machine and cost 0 credits.

commands:
  reddit search <json>  Search Reddit posts server-side; requires auth; 1 credit
  reddit feed <json>    Fetch subreddit feed locally; no auth; 0 credits
  reddit post <json>    Fetch post content and comments locally; no auth; 0 credits
  reddit user <json>    Fetch user posts or comments locally; no auth; 0 credits

agent routing:
  latest/top posts in a known subreddit    caphub reddit feed
  known Reddit post ID or URL              caphub reddit post
  known Reddit username                    caphub reddit user
  topic discovery across Reddit            caphub reddit search

examples:
  caphub reddit search '{"query":"qwen3 8b","subreddit":"LocalLLaMA","time":"month","limit":10}'
  caphub reddit feed '{"subreddit":"worldnews","sort":"new","limit":25}'
  caphub reddit feed '{"subreddit":"LocalLLaMA","sort":"top","time":"week","limit":10}'
  caphub reddit post '{"id":"1kaqi3k","comments":"top","comment_limit":20,"comment_depth":3}'
  caphub reddit user '{"username":"Ok-Contribution9043","type":"comments","limit":10}'
`;

const YOUTUBE_HELP = `caphub youtube

Hybrid YouTube capability.

Use local transcript reads when the agent already knows the target video and is running on a machine with normal outbound internet access. Use server-side YouTube endpoints when the agent needs discovery, channel or playlist traversal, or a paid fallback for transcript extraction. Server transcript fallback is priced at 2 Caphub credits under the current Caphub pricing model.

commands:
  youtube transcript <json>         Fetch transcript locally; no auth; 0 credits
  youtube transcript-server <json>  Fetch transcript server-side; requires auth; 2 credits
  youtube search <json>             Search YouTube videos server-side; requires auth; 1 credit
  youtube channel-resolve <json>    Resolve @handle/URL/UC... ID server-side; requires auth; 0 credits
  youtube channel-search <json>     Search within a channel server-side; requires auth; 1 credit
  youtube channel-videos <json>     List channel uploads page-by-page server-side; requires auth; 1 credit per page
  youtube channel-latest <json>     Fetch latest 15 channel videos server-side; requires auth; 0 credits
  youtube playlist-videos <json>    List playlist videos page-by-page server-side; requires auth; 1 credit per page

agent routing:
  known video id/url + local machine            caphub youtube transcript
  known video id/url + no local network path    caphub youtube transcript-server
  topic discovery across YouTube                caphub youtube search
  convert @handle or channel URL to UC... ID    caphub youtube channel-resolve
  search within one creator/channel             caphub youtube channel-search
  enumerate uploads from a known channel        caphub youtube channel-videos
  latest videos from a known channel            caphub youtube channel-latest
  enumerate videos from a playlist              caphub youtube playlist-videos

examples:
  caphub youtube transcript '{"video_url":"GmE4JwmFuHk"}'
  caphub youtube transcript '{"video_url":"https://youtu.be/GmE4JwmFuHk","language":"en","send_metadata":true}'
  caphub youtube transcript-server '{"video_url":"GmE4JwmFuHk","send_metadata":true}'
  caphub youtube search '{"queries":["qwen3 8b review"],"limit":10}'
  caphub youtube channel-resolve '{"input":"@TED"}'
  caphub youtube channel-search '{"channel":"@TED","q":"ai","limit":10}'
  caphub youtube channel-videos '{"channel":"@TED"}'
  caphub youtube channel-latest '{"channel":"@TED"}'
  caphub youtube playlist-videos '{"playlist":"PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"}'
`;

const FINANCE_HELP = `caphub finance

Server-side finance capability.

Use finance news when the input is a stock ticker symbol and the agent needs the last 24 hours of recent coverage. This endpoint is server-only, requires auth, and costs 1 credit per ticker query.

commands:
  finance news <json>  Fetch recent ticker news server-side; requires auth; 1 credit per ticker

agent routing:
  recent headlines for a known stock ticker      caphub finance news
  non-ticker company research                    use caphub search instead

examples:
  caphub finance news '{"queries":["NVDA","AAPL"]}'
  caphub finance news '{"queries":["BRK.B"],"limit":20}'
`;

const MAPS_HELP = `caphub maps

Server-side maps capability.

Use maps search when the agent knows what to look for and the named area, but not exact coordinates. The server resolves the area name to coordinates, then searches Google Maps around that viewport. Zoom is optional and must stay between 11 and 18. This endpoint currently costs 3 credits per request.

commands:
  maps search <json>  Search Google Maps in a named area server-side; requires auth; 3 credits

agent routing:
  category or business type in a named area       caphub maps search
  exact place text search with reviews            caphub places

examples:
  caphub maps search '{"query":"pizza","area":"Chiang Mai","zoom":11}'
  caphub maps search '{"query":"coworking","area":"Koh Phangan"}'
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

async function localFetchJson(url) {
  let resp;
  try {
    resp = await fetch(url, {
      headers: LOCAL_FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(LOCAL_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error.name === "TimeoutError"
      ? `timeout ${LOCAL_FETCH_TIMEOUT_MS / 1000}s`
      : (error.cause?.code || error.message);
    throw new Error(`local Reddit fetch failed: ${reason}`);
  }

  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`local Reddit fetch returned non-JSON response (HTTP ${resp.status})`);
  }

  if (!resp.ok) {
    const reason = data?.message || data?.error || `HTTP ${resp.status}`;
    throw new Error(`local Reddit fetch failed: ${reason}`);
  }

  return data;
}

async function localFetchText(url, label) {
  let resp;
  try {
    resp = await fetch(url, {
      headers: LOCAL_FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(LOCAL_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error.name === "TimeoutError"
      ? `timeout ${LOCAL_FETCH_TIMEOUT_MS / 1000}s`
      : (error.cause?.code || error.message);
    throw new Error(`${label} failed: ${reason}`);
  }

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`${label} failed: HTTP ${resp.status}`);
  }
  if (!text) {
    throw new Error(`${label} returned an empty response`);
  }
  return text;
}

async function fetchYouTubeWatchPage(videoId) {
  const fetchHtml = async (cookie = "") => {
    let resp;
    try {
      resp = await fetch(`${YOUTUBE_BASE_URL}/watch?v=${videoId}`, {
        headers: {
          ...LOCAL_FETCH_HEADERS,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        redirect: "follow",
        signal: AbortSignal.timeout(LOCAL_FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error.name === "TimeoutError"
        ? `timeout ${LOCAL_FETCH_TIMEOUT_MS / 1000}s`
        : (error.cause?.code || error.message);
      throw new Error(`local YouTube video page fetch failed: ${reason}`);
    }

    const html = await resp.text();
    if (!resp.ok) throw new Error(`local YouTube video page fetch failed: HTTP ${resp.status}`);
    return html;
  };

  let html = await fetchHtml();
  let cookie = "";
  if (html.includes('action="https://consent.youtube.com/s"')) {
    const consentValue = html.match(/name="v" value="(.*?)"/)?.[1] || "";
    if (consentValue) {
      cookie = `CONSENT=YES+${consentValue}`;
      html = await fetchHtml(cookie);
    }
  }

  return { html, cookie };
}

async function readJsonCommandInput(args, label) {
  const arg = args[0];
  const rawInput = arg ?? (process.stdin.isTTY ? "" : await readStdin());
  if (!rawInput.trim()) {
    fail(`Error: input JSON is required.\n\nnext:\n  - caphub ${label} --help`);
  }

  try {
    const parsed = JSON.parse(rawInput);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail(`Error: input must be a JSON object.\n\nnext:\n  - caphub ${label} --help`);
    }
    return parsed;
  } catch {
    fail(`Error: input must be valid JSON.\n\nnext:\n  - caphub ${label} --help\n  - pass exactly one JSON object`);
  }
}

function normalizeLimit(value, fallback, max) {
  const limit = Number(value || fallback);
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(limit)));
}

function normalizeRedditSubreddit(value) {
  if (typeof value !== "string") return "";
  const subreddit = value.trim().replace(/^r\//i, "");
  return /^[A-Za-z0-9_]{2,21}$/.test(subreddit) ? subreddit : "";
}

function normalizeRedditUsername(value) {
  if (typeof value !== "string") return "";
  const username = value.trim().replace(/^u\//i, "");
  return /^[A-Za-z0-9_-]{3,20}$/.test(username) ? username : "";
}

function normalizeRedditPostId(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).pathname.match(/\/comments\/([a-z0-9]+)(?:\/|$)/i)?.[1] || "";
    } catch {
      return "";
    }
  }
  return /^[a-z0-9]+$/i.test(raw) ? raw : "";
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeYouTubeVideoInput(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    if (url.hostname === "youtu.be") {
      const candidate = url.pathname.split("/").filter(Boolean)[0] || "";
      return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : "";
    }
    if (!/(^|\.)youtube\.com$/i.test(url.hostname)) return "";
    const watchId = url.searchParams.get("v");
    if (watchId && /^[A-Za-z0-9_-]{11}$/.test(watchId)) return watchId;

    const pathMatch = url.pathname.match(/\/(shorts|embed|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/i);
    return pathMatch?.[2] || "";
  } catch {
    return "";
  }
}

function normalizeYouTubeVideoUrl(value) {
  const videoId = normalizeYouTubeVideoInput(value);
  return videoId ? `${YOUTUBE_BASE_URL}/watch?v=${videoId}` : "";
}

function normalizeYouTubeHandleInput(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  return raw && raw.length <= 200 ? raw : "";
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return fallback;
}

function createdUtcToIso(value) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function absoluteRedditUrl(pathOrUrl) {
  if (typeof pathOrUrl !== "string" || !pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${REDDIT_BASE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function decodeHtml(value) {
  if (typeof value !== "string" || !value) return "";
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function stripXmlTags(value) {
  return typeof value === "string" ? value.replace(/<[^>]+>/g, "") : "";
}

function flattenTextSegments(segments) {
  return segments.map((segment) => segment.text).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function formatTranscriptText(segments, includeTimestamp) {
  return segments
    .map((segment) => includeTimestamp ? `[${segment.start.toFixed(2)}s] ${segment.text}` : segment.text)
    .join("\n")
    .trim();
}

function parseYoutubeCaptionXml(xml) {
  const segments = [];
  for (const match of xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const attrs = match[1] || "";
    const rawText = match[2] || "";
    const start = Number(attrs.match(/\bstart="([^"]+)"/)?.[1] || 0);
    const duration = Number(attrs.match(/\bdur="([^"]+)"/)?.[1] || 0);
    const text = decodeHtml(stripXmlTags(rawText)).replace(/\s+/g, " ").trim();
    if (!text) continue;
    segments.push({
      text,
      start: Number(start.toFixed(3)),
      duration: Number(duration.toFixed(3)),
    });
  }
  if (segments.length) return segments;

  for (const match of xml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const attrs = match[1] || "";
    const rawText = match[2] || "";
    const startMs = Number(attrs.match(/\bt="([^"]+)"/)?.[1] || 0);
    const durationMs = Number(attrs.match(/\bd="([^"]+)"/)?.[1] || 0);
    const text = decodeHtml(stripXmlTags(rawText))
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    segments.push({
      text,
      start: Number((startMs / 1000).toFixed(3)),
      duration: Number((durationMs / 1000).toFixed(3)),
    });
  }
  return segments;
}

function pickYouTubeCaptionTrack(tracks, preferredLanguage) {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  const preferred = typeof preferredLanguage === "string" ? preferredLanguage.trim().toLowerCase() : "";
  if (preferred) {
    const exact = tracks.find((track) => String(track.languageCode || "").toLowerCase() === preferred);
    if (exact) return exact;
    const partial = tracks.find((track) => String(track.languageCode || "").toLowerCase().startsWith(preferred));
    if (partial) return partial;
  }
  return tracks.find((track) => track.kind !== "asr") || tracks[0];
}

function extractInnertubeApiKey(html) {
  return html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1]
    || html.match(/INNERTUBE_API_KEY["']?\s*:\s*["']([^"']+)["']/)?.[1]
    || "";
}

function extractVisitorData(html) {
  return html.match(/"VISITOR_DATA":"([^"]+)"/)?.[1]
    || html.match(/"visitorData":"([^"]+)"/)?.[1]
    || "";
}

async function fetchLocalYouTubeTranscript(body) {
  const videoId = normalizeYouTubeVideoInput(body.video_url || body.videoId || body.video_id || body.id);
  if (!videoId) fail("Error: video_url is required and must be a YouTube video URL or 11-character video ID.");

  const format = normalizeEnum(body.format, ["json", "text"], "json");
  const includeTimestamp = normalizeBoolean(body.include_timestamp, true);
  const sendMetadata = normalizeBoolean(body.send_metadata, false);
  const preferredLanguage = typeof body.language === "string" ? body.language.trim() : "";

  let html;
  let youtubeCookie = "";
  try {
    const page = await fetchYouTubeWatchPage(videoId);
    html = page.html;
    youtubeCookie = page.cookie;
  } catch (error) {
    fail(`Error: ${error.message}`);
  }

  const apiKey = extractInnertubeApiKey(html);
  if (!apiKey) fail("Error: local YouTube transcript fetch failed: could not extract INNERTUBE_API_KEY.");

  let playerResponse;
  try {
    const resp = await fetch(`${YOUTUBE_BASE_URL}/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(youtubeCookie ? { Cookie: youtubeCookie } : {}),
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
          },
        },
        videoId,
      }),
      signal: AbortSignal.timeout(LOCAL_FETCH_TIMEOUT_MS),
    });
    const raw = await resp.text();
    try {
      playerResponse = raw ? JSON.parse(raw) : {};
    } catch {
      playerResponse = { raw };
    }
    if (!resp.ok) {
      const reason = playerResponse?.error?.message
        || playerResponse?.playabilityStatus?.reason
        || playerResponse?.raw
        || `HTTP ${resp.status}`;
      fail(`Error: local YouTube transcript fetch failed: ${reason}`);
    }
  } catch (error) {
    const reason = error.name === "TimeoutError"
      ? `timeout ${LOCAL_FETCH_TIMEOUT_MS / 1000}s`
      : (error.cause?.code || error.message);
    fail(`Error: local YouTube transcript fetch failed: ${reason}`);
  }

  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const track = pickYouTubeCaptionTrack(tracks, preferredLanguage);
  if (!track?.baseUrl) {
    const reason = playerResponse?.playabilityStatus?.reason || "captions unavailable";
    fail(`Error: local YouTube transcript fetch failed: ${reason}`);
  }

  let xml;
  try {
    xml = await localFetchText(track.baseUrl, "local YouTube caption fetch");
  } catch (error) {
    fail(`Error: ${error.message}`);
  }

  const segments = parseYoutubeCaptionXml(xml);
  if (!segments.length) fail("Error: local YouTube transcript fetch failed: transcript returned no segments.");

  const outputTranscript = format === "json"
    ? (
        includeTimestamp
          ? segments
          : segments.map(({ text }) => ({ text }))
      )
    : undefined;
  const transcriptText = format === "text"
    ? formatTranscriptText(segments, includeTimestamp)
    : flattenTextSegments(segments);
  const metadata = sendMetadata
    ? {
        title: playerResponse?.videoDetails?.title || null,
        author_name: playerResponse?.videoDetails?.author || null,
        author_url: playerResponse?.videoDetails?.channelId
          ? `${YOUTUBE_BASE_URL}/channel/${playerResponse.videoDetails.channelId}`
          : null,
        thumbnail_url: playerResponse?.videoDetails?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || null,
      }
    : undefined;

  return {
    action: "transcript",
    video_id: videoId,
    video_url: normalizeYouTubeVideoUrl(videoId),
    language: track.languageCode || null,
    language_name: track.name?.simpleText || track.vssId || null,
    is_generated: track.kind === "asr",
    local: true,
    billing: { credits_used: 0 },
    format,
    ...(outputTranscript ? { transcript: outputTranscript } : {}),
    transcript_text: transcriptText,
    ...(metadata ? { metadata: Object.fromEntries(Object.entries(metadata).filter(([, value]) => value)) } : {}),
  };
}

function parseRedditResultUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl) return {};
  try {
    const url = new URL(rawUrl);
    const postId = url.pathname.match(/\/comments\/([a-z0-9]+)(?:\/|$)/i)?.[1] || "";
    const subreddit = url.pathname.match(/\/r\/([^/]+)(?:\/|$)/i)?.[1] || "";
    return {
      ...(postId ? { post_id: postId } : {}),
      ...(subreddit ? { subreddit } : {}),
    };
  } catch {
    return {};
  }
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
    ? `caphub search '{"queries":["best AI agent frameworks 2026","autonomous coding agents"]}'`
    : payload.capability === "shopping"
      ? `caphub shopping '{"queries":["apple m5 pro"]}'`
      : payload.capability === "places"
        ? `caphub places '{"queries":["best pizza in Vienna"]}'`
        : `caphub ${payload.capability} '${JSON.stringify(payload.input_contract)}'`;
  const configuredRequestExample = payload.capability === "search"
    ? `caphub search '{"queries":["EV discounts Thailand"],"country":"th","language":"en","from_time":"week"}'`
    : payload.capability === "shopping"
      ? `caphub shopping '{"queries":["apple m5 pro"],"country":"th","language":"en"}'`
      : payload.capability === "places"
        ? `caphub places '{"cids":["13290506179446267841"],"sort_by":"newest"}'`
        : null;
  const responseShape = payload.capability === "search"
    ? {
        queries: [
          {
            query: "string",
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
              query: "string",
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
          queries: [{ query: "string" }],
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
                },
              ],
            },
          ],
          cids: ["optional CID string"],
          sort_by: "mostRelevant | newest | highestRating | lowestRating",
          reviews: [
            {
              cid: "string",
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
    "country",
    "language",
    "from_time",
    "max_queries",
    "include_meta",
    "include_result_meta",
  ];
  const shoppingParameterOrder = [
    "queries",
    "queries[] as string",
    "country",
    "language",
    "max_queries",
    "include_meta",
    "include_result_meta",
  ];
  const placesParameterOrder = [
    "queries",
    "queries[] as string",
    "cids",
    "cids[] as string",
    "sort_by",
    "max_queries",
    "max_cids",
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
  const limitParts = [];
  if (payload.limits?.max_queries_per_request) limitParts.push(`max ${payload.limits.max_queries_per_request} queries per request`);
  if (payload.limits?.max_cids_per_request) limitParts.push(`max ${payload.limits.max_cids_per_request} CIDs per request`);
  const lines = [
    title,
    "-".repeat(title.length),
    "",
    `description: ${payload.purpose}`,
    "",
    `endpoint: ${payload.endpoint}`,
    `method: ${payload.method}`,
    payload.credits ? `credits: ${payload.credits}` : null,
    limitParts.length ? `limits: ${limitParts.join(", ")}` : null,
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

function normalizeRedditPostData(data) {
  const permalink = absoluteRedditUrl(data.permalink || "");
  const createdUtc = createdUtcToIso(data.created_utc);
  const body = decodeHtml(data.selftext || "");
  const out = {
    post_id: data.id || "",
    subreddit: data.subreddit || "",
    title: decodeHtml(data.title || ""),
    author: data.author || "",
    score: Number(data.score || 0),
    upvote_ratio: typeof data.upvote_ratio === "number" ? data.upvote_ratio : null,
    comment_count: Number(data.num_comments || 0),
    created_utc: createdUtc,
    flair: decodeHtml(data.link_flair_text || "") || null,
    url: permalink || absoluteRedditUrl(data.url || ""),
    permalink: permalink || null,
    is_self: Boolean(data.is_self),
  };
  if (body) out.body = body;
  if (body) out.preview = body.slice(0, 300);
  if (data.url && data.url !== data.permalink) out.external_url = data.url;
  return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== null && value !== ""));
}

function normalizeRedditCommentData(data, replies = []) {
  const createdUtc = createdUtcToIso(data.created_utc);
  return Object.fromEntries(Object.entries({
    id: data.id || "",
    author: data.author || "",
    score: Number(data.score || 0),
    body: decodeHtml(data.body || ""),
    created_utc: createdUtc,
    permalink: data.permalink ? absoluteRedditUrl(data.permalink) : null,
    replies,
  }).filter(([, value]) => value !== null && value !== ""));
}

function parseCommentTree(children, maxDepth, currentDepth = 1) {
  if (!Array.isArray(children) || currentDepth > maxDepth) return [];
  const comments = [];

  for (const child of children) {
    if (!child || child.kind !== "t1" || !child.data) continue;
    const replyListing = child.data.replies && typeof child.data.replies === "object"
      ? child.data.replies?.data?.children
      : [];
    comments.push(normalizeRedditCommentData(
      child.data,
      parseCommentTree(replyListing, maxDepth, currentDepth + 1)
    ));
  }

  return comments;
}

function normalizeRedditUserItem(child) {
  if (!child?.data) return null;
  if (child.kind === "t3") {
    return { type: "post", ...normalizeRedditPostData(child.data) };
  }
  if (child.kind === "t1") {
    const createdUtc = createdUtcToIso(child.data.created_utc);
    return Object.fromEntries(Object.entries({
      type: "comment",
      id: child.data.id || "",
      author: child.data.author || "",
      subreddit: child.data.subreddit || "",
      post_id: typeof child.data.link_id === "string" ? child.data.link_id.replace(/^t3_/, "") : "",
      post_title: decodeHtml(child.data.link_title || ""),
      score: Number(child.data.score || 0),
      body: decodeHtml(child.data.body || ""),
      created_utc: createdUtc,
      permalink: child.data.permalink ? absoluteRedditUrl(child.data.permalink) : null,
    }).filter(([, value]) => value !== null && value !== ""));
  }
  return null;
}

async function redditSearch(args) {
  const body = await readJsonCommandInput(args, "reddit search");
  const apiKey = getApiKey();
  if (!apiKey) {
    fail("Error: reddit search requires an api key because it runs server-side and consumes credits.\n\nnext:\n  - caphub auth login\n  - or set CAPHUB_API_KEY");
  }

  const payload = await fetchJson(`${getApiUrl()}/v1/reddit/search`, {
    method: "POST",
    apiKey,
    body,
  });

  const results = (payload.results || []).map((item) => ({
    ...item,
    ...parseRedditResultUrl(item.url),
  }));

  process.stdout.write(`${JSON.stringify({ ...payload, results }, null, 2)}\n`);
}

async function redditFeed(args) {
  const body = await readJsonCommandInput(args, "reddit feed");
  const subreddit = normalizeRedditSubreddit(body.subreddit);
  if (!subreddit) fail("Error: subreddit is required and must be a valid subreddit name.");

  const sort = normalizeEnum(body.sort, ["hot", "new", "top", "rising"], "hot");
  const time = normalizeEnum(body.time, ["hour", "day", "week", "month", "year", "all"], "week");
  const limit = normalizeLimit(body.limit, 25, 100);
  const url = new URL(`${REDDIT_BASE_URL}/r/${subreddit}/${sort}.json`);
  url.searchParams.set("limit", String(limit));
  if (sort === "top") url.searchParams.set("t", time);

  let data;
  try {
    data = await localFetchJson(url.toString());
  } catch (error) {
    fail(`Error: ${error.message}`);
  }

  const posts = (data?.data?.children || [])
    .filter((child) => child.kind === "t3" && child.data)
    .map((child) => normalizeRedditPostData(child.data));

  process.stdout.write(`${JSON.stringify({
    action: "feed",
    subreddit,
    sort,
    ...(sort === "top" ? { time } : {}),
    local: true,
    billing: { credits_used: 0 },
    posts,
  }, null, 2)}\n`);
}

async function redditPost(args) {
  const body = await readJsonCommandInput(args, "reddit post");
  const id = normalizeRedditPostId(body.id || body.url);
  if (!id) fail("Error: id is required and must be a Reddit post ID or Reddit post URL.");

  const comments = normalizeEnum(body.comments || body.sort, ["top", "new", "controversial", "old"], "top");
  const commentLimit = normalizeLimit(body.comment_limit, 50, 100);
  const commentDepth = normalizeLimit(body.comment_depth, 3, 10);
  const url = new URL(`${REDDIT_BASE_URL}/comments/${id}.json`);
  url.searchParams.set("sort", comments);
  url.searchParams.set("limit", String(commentLimit));
  url.searchParams.set("depth", String(commentDepth));

  let data;
  try {
    data = await localFetchJson(url.toString());
  } catch (error) {
    fail(`Error: ${error.message}`);
  }

  const postData = data?.[0]?.data?.children?.find((child) => child.kind === "t3")?.data;
  if (!postData) fail("Error: Reddit post was not found.");

  const commentChildren = data?.[1]?.data?.children || [];
  process.stdout.write(`${JSON.stringify({
    action: "post",
    local: true,
    billing: { credits_used: 0 },
    post: normalizeRedditPostData(postData),
    comments: parseCommentTree(commentChildren, commentDepth),
  }, null, 2)}\n`);
}

async function redditUser(args) {
  const body = await readJsonCommandInput(args, "reddit user");
  const username = normalizeRedditUsername(body.username);
  if (!username) fail("Error: username is required and must be a valid Reddit username.");

  const type = normalizeEnum(body.type, ["posts", "comments"], "posts");
  const sort = normalizeEnum(body.sort, ["new", "hot", "top"], "new");
  const limit = normalizeLimit(body.limit, 25, 100);
  const path = type === "comments" ? "comments" : "submitted";
  const url = new URL(`${REDDIT_BASE_URL}/user/${username}/${path}.json`);
  url.searchParams.set("sort", sort);
  url.searchParams.set("limit", String(limit));

  let data;
  try {
    data = await localFetchJson(url.toString());
  } catch (error) {
    fail(`Error: ${error.message}`);
  }

  const items = (data?.data?.children || [])
    .map(normalizeRedditUserItem)
    .filter(Boolean);

  process.stdout.write(`${JSON.stringify({
    action: "user",
    username,
    type,
    sort,
    local: true,
    billing: { credits_used: 0 },
    items,
  }, null, 2)}\n`);
}

async function commandReddit(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h" || sub === "help") {
    process.stdout.write(REDDIT_HELP);
    return;
  }

  if (sub === "search") {
    await redditSearch(args.slice(1));
    return;
  }
  if (sub === "feed") {
    await redditFeed(args.slice(1));
    return;
  }
  if (sub === "post") {
    await redditPost(args.slice(1));
    return;
  }
  if (sub === "user") {
    await redditUser(args.slice(1));
    return;
  }

  fail("Error: reddit actions are: search, feed, post, user.");
}

async function financeServerAction(action, args, { requiresAuth = true } = {}) {
  const body = await readJsonCommandInput(args, `finance ${action}`);
  const apiKey = getApiKey();
  if (requiresAuth && !apiKey) {
    fail(`Error: finance ${action} requires an api key because it runs server-side.\n\nnext:\n  - caphub auth login\n  - or set CAPHUB_API_KEY`);
  }
  const payload = await fetchJson(`${getApiUrl()}/v1/finance/${action}`, {
    method: "POST",
    apiKey,
    body,
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function mapsServerAction(action, args, { requiresAuth = true } = {}) {
  const body = await readJsonCommandInput(args, `maps ${action}`);
  const apiKey = getApiKey();
  if (requiresAuth && !apiKey) {
    fail(`Error: maps ${action} requires an api key because it runs server-side.\n\nnext:\n  - caphub auth login\n  - or set CAPHUB_API_KEY`);
  }
  const payload = await fetchJson(`${getApiUrl()}/v1/maps/${action}`, {
    method: "POST",
    apiKey,
    body,
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function youtubeServerAction(action, args, { requiresAuth = true } = {}) {
  const body = await readJsonCommandInput(args, `youtube ${action}`);
  const apiKey = getApiKey();
  if (requiresAuth && !apiKey) {
    fail(`Error: youtube ${action} requires an api key because it runs server-side.\n\nnext:\n  - caphub auth login\n  - or set CAPHUB_API_KEY`);
  }
  const payload = await fetchJson(`${getApiUrl()}/v1/youtube/${action}`, {
    method: "POST",
    apiKey,
    body,
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function youtubeTranscript(args) {
  const body = await readJsonCommandInput(args, "youtube transcript");
  const payload = await fetchLocalYouTubeTranscript(body);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function commandYouTube(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h" || sub === "help") {
    process.stdout.write(YOUTUBE_HELP);
    return;
  }

  if (sub === "transcript") {
    await youtubeTranscript(args.slice(1));
    return;
  }
  if (sub === "transcript-server") {
    await youtubeServerAction("transcript", args.slice(1));
    return;
  }
  if (sub === "search") {
    await youtubeServerAction("search", args.slice(1));
    return;
  }
  if (sub === "channel-resolve") {
    await youtubeServerAction("channel-resolve", args.slice(1));
    return;
  }
  if (sub === "channel-search") {
    await youtubeServerAction("channel-search", args.slice(1));
    return;
  }
  if (sub === "channel-videos") {
    await youtubeServerAction("channel-videos", args.slice(1));
    return;
  }
  if (sub === "channel-latest") {
    await youtubeServerAction("channel-latest", args.slice(1));
    return;
  }
  if (sub === "playlist-videos") {
    await youtubeServerAction("playlist-videos", args.slice(1));
    return;
  }

  fail("Error: youtube actions are: transcript, transcript-server, search, channel-resolve, channel-search, channel-videos, channel-latest, playlist-videos.");
}

async function commandFinance(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h" || sub === "help") {
    process.stdout.write(FINANCE_HELP);
    return;
  }

  if (sub === "news") {
    await financeServerAction("news", args.slice(1));
    return;
  }

  fail("Error: finance actions are: news.");
}

async function commandMaps(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h" || sub === "help") {
    process.stdout.write(MAPS_HELP);
    return;
  }

  if (sub === "search") {
    await mapsServerAction("search", args.slice(1));
    return;
  }

  fail("Error: maps actions are: search.");
}

async function commandHelp(args) {
  const apiUrl = getApiUrl();
  const capability = args[0];
  if (!capability) {
    process.stdout.write(ROOT_HELP);
    return;
  }
  if (capability === "reddit") {
    process.stdout.write(REDDIT_HELP);
    return;
  }
  if (capability === "youtube") {
    process.stdout.write(YOUTUBE_HELP);
    return;
  }
  if (capability === "finance") {
    process.stdout.write(FINANCE_HELP);
    return;
  }
  if (capability === "maps") {
    process.stdout.write(MAPS_HELP);
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

  if (cmd === "reddit") {
    await commandReddit(args.slice(1));
    return;
  }

  if (cmd === "youtube") {
    await commandYouTube(args.slice(1));
    return;
  }

  if (cmd === "finance") {
    await commandFinance(args.slice(1));
    return;
  }

  if (cmd === "maps") {
    await commandMaps(args.slice(1));
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
