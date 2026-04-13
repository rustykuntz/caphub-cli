#!/usr/bin/env node

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
import os from "node:os";
import { isIP } from "node:net";
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
const LOCAL_FETCH_MAX_REDIRECTS = 5;
const DEFAULT_QUEUE_MAX_POSITIONS = 15;
const DEFAULT_QUEUE_MAX_WAIT_MS = 60_000;
const DEFAULT_QUEUE_MIN_POLL_MS = 1000;
const DEFAULT_QUEUE_MAX_POLL_MS = 2500;
const REDDIT_BASE_URL = "https://www.reddit.com";
const YOUTUBE_BASE_URL = "https://www.youtube.com";

const LOCAL_FETCH_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "max-age=0",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
};

const ROOT_HELP = `caphub

Use CapHub to research products, compare offers, find the best places, learn a topic, get the latest news, and more without dragging full websites into context.

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
  <capability> <json>   run a capability directly, e.g. search, scholar, patents, search-ideas, or shopping
  fetch page <json>     fetch a public webpage locally; free
  reddit search <json>  search Reddit posts server-side; costs credits
  reddit feed <json>    fetch subreddit feed locally; free
  reddit post <json>    fetch post content and comments locally; free
  reddit user <json>    fetch user posts or comments locally; free
  x user <json>         fetch compact X profile data server-side; costs credits
  x tweets <json>       fetch compact X tweets server-side; costs credits
  youtube search <json> search YouTube videos server-side; costs credits
  youtube transcript <json> fetch YouTube transcript locally; free
  news world <json>     fetch recent world news for one country server-side; costs credits
  news finance <json>   fetch recent stock ticker news server-side; costs credits
  maps search <json>    search Google Maps in a named area server-side; costs credits
  cost daily <json>     fetch daily CapHub cost breakdown server-side; 0 credits
  cost log <json>       fetch recent CapHub usage log server-side; 0 credits
  travel flights <json> search flights server-side; costs credits
  travel hotels <json>  search hotels by destination server-side; costs credits
  travel hotel <json>   fetch one hotel's room prices server-side; costs credits
  jobs indeed <json>    search Indeed jobs server-side; costs credits
  jobs linkedin <json>  search LinkedIn jobs server-side; costs credits
  weather forecast <json> fetch daily weather forecast by place name server-side; costs credits

recommended flow:
  1. caphub capabilities
  2. caphub help <capability>
  3. caphub auth login
  4. caphub <capability> '<json>' or caphub reddit|x|jobs|youtube|finance|news|maps|cost|travel|weather <action> '<json>'

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
  caphub help fetch
  caphub search '{"queries":["best AI agent frameworks 2026"]}'
  caphub fetch page '{"url":"https://example.com"}'
  caphub scholar '{"queries":["faster skin regeneration"],"country":"us","language":"en"}'
  caphub patents '{"queries":["faster skin regeneration"],"include_figures":false}'
  caphub shopping '{"queries":["apple m5 pro"],"country":"th","language":"en"}'
  caphub reddit search '{"query":"qwen3 8b","subreddit":"LocalLLaMA"}'
  caphub reddit feed '{"subreddit":"worldnews","sort":"new","limit":25}'
  caphub x user '{"username":"elonmusk"}'
  caphub x tweets '{"username":"MrBeast","count":10}'
  caphub youtube search '{"queries":["qwen3 8b review"],"limit":10}'
  caphub youtube transcript '{"video_url":"GmE4JwmFuHk"}'
  caphub news world '{"country":"Hungary","language":"local"}'
  caphub news finance '{"queries":["NVDA","AAPL"]}'
  caphub maps search '{"query":"pizza","area":"Chiang Mai","zoom":11}'
  caphub maps places '{"queries":["best pizza in Vienna"]}'
  caphub maps reviews '{"cids":["13290506179446267841"],"sort_by":"newest"}'
  caphub cost daily '{"days":30}'
  caphub cost log '{"limit":50}'
  caphub travel flights '{"tripType":"round-trip","origin":"LHR","destination":"JFK","departDate":"2026-06-01","returnDate":"2026-06-08","cabinClass":"business","adults":1}'
  caphub travel flights '{"tripType":"one-way","origin":"LHR","destination":"JFK","departDate":"2026-06-01","cabinClass":"business","adults":1}'
  caphub travel hotels '{"destination":"Lindos, Rhodes","checkin_date":"2026-07-01","checkout_date":"2026-07-10","adults":2,"currency":"EUR","budget_per_night":100,"filters":["free_cancellation"]}'
  caphub travel hotel '{"hotel_name":"InterContinental Dubai Marina by IHG","location":"Dubai Marina","checkin_date":"2026-05-01","checkout_date":"2026-05-10","adults":2,"currency":"EUR"}'
  caphub jobs indeed '{"query":"United Nations programme officer","country":"us","location":"New York","sort_by":"relevance"}'
  caphub jobs indeed '{"query":"sports software engineer","country":"us","location":"Remote","sort_by":"date"}'
  caphub jobs linkedin '{"query":"English teacher","location":"Bangkok","date_posted":"month"}'
  caphub jobs linkedin '{"query":"growth marketing manager","location":"Singapore","workplace_types":["remote","hybrid"],"experience_levels":["associate","mid_senior"],"employment_types":["fulltime"]}'
  caphub weather forecast '{"location":"Koh Phangan","days":3}'
`;

const FETCH_HELP = `caphub fetch

Local page fetch capability.

Use fetch page when you need a public webpage read directly from this machine without using a browser loop. This is useful for pulling the main text from known URLs before deciding whether a fuller browser flow is needed.

commands:
  fetch page <json>  Fetch a public webpage locally; no auth; 0 credits

routing:
  known public webpage URL                    caphub fetch page
  search or discovery first                   use caphub search before fetch page
  pages behind login or heavy interaction     use the browser instead

examples:
  caphub fetch page '{"url":"https://example.com"}'
  caphub fetch page '{"url":"https://example.com","include_html":true,"max_chars":8000}'
`;

const SEARCH_HELP = `caphub search

Server-side web search capability.

Use search when you need compact cited web research fast.

commands:
  search <json>  Search the web server-side; requires auth; 1 credit per query, up to 5 queries in parallel

routing:
  compact cited web research                 caphub search
  widen the query plan first                 caphub search-ideas
  known public page URL                      caphub fetch page

response fields:
  queries[].query
  queries[].country
  queries[].language
  queries[].from_time
  results[].query
  results[].items[].title
  results[].items[].link
  results[].items[].source_domain
  results[].items[].snippet
  results[].items[].date
  total_usage.total_credits_used
  total_usage.credits_remaining
  billing.credits_used
  took_ms

examples:
  caphub search '{"queries":["best AI agent frameworks 2026"]}'
  caphub search '{"queries":["best AI agent frameworks 2026","autonomous coding agents"],"country":"us","language":"en"}'
  caphub search '{"queries":["EV discounts Thailand"],"country":"th","language":"en","from_time":"week"}'
`;

const SCHOLAR_HELP = `caphub scholar

Server-side academic search capability.

Use scholar when you need papers, citations, and academic sources.

commands:
  scholar <json>  Search academic sources server-side; requires auth; 1 credit per query, up to 5 queries in parallel

routing:
  academic papers and citations               caphub scholar
  patent prior art or assignees               caphub patents
  general web research                        caphub search

response fields:
  queries[].query
  queries[].country
  queries[].language
  results[].query
  results[].items[].title
  results[].items[].link
  results[].items[].publication_info
  results[].items[].snippet
  results[].items[].year
  results[].items[].cited_by
  results[].items[].pdf_url
  results[].items[].id
  total_usage.total_credits_used
  total_usage.credits_remaining
  billing.credits_used
  took_ms

examples:
  caphub scholar '{"queries":["world models for robotics 2025"]}'
  caphub scholar '{"queries":["world models for robotics 2025","world models for robotics 2026"],"country":"us","language":"en"}'
`;

const PATENTS_HELP = `caphub patents

Server-side patent search capability.

Use patents when you need prior art, inventors, assignees, filing dates, or publication numbers.

commands:
  patents <json>  Search patents server-side; requires auth; 1 credit per query, or 3 credits with include_figures, up to 5 queries in parallel

routing:
  patent prior art and filing metadata        caphub patents
  academic papers and citations               caphub scholar
  general web research                        caphub search

response fields:
  queries[].query
  results[].query
  results[].items[].title
  results[].items[].link
  results[].items[].snippet
  results[].items[].priority_date
  results[].items[].filing_date
  results[].items[].grant_date
  results[].items[].publication_date
  results[].items[].inventor
  results[].items[].assignee
  results[].items[].publication_number
  results[].items[].language
  results[].items[].pdf_url
  results[].items[].figures
  total_usage.total_credits_used
  total_usage.credits_remaining
  billing.credits_used
  took_ms

examples:
  caphub patents '{"queries":["faster skin regeneration"]}'
  caphub patents '{"queries":["faster skin regeneration"],"include_figures":true}'
`;

const SEARCH_IDEAS_HELP = `caphub search-ideas

Server-side query planning capability.

Use search-ideas when you want to widen the query plan before spending credits on full search.

commands:
  search-ideas <json>  Generate search suggestions server-side; requires auth; 1 credit per query, up to 5 queries in parallel

routing:
  widen the query plan first                  caphub search-ideas
  run full cited web research                 caphub search
  academic sources                            caphub scholar

response fields:
  queries[].query
  queries[].country
  queries[].language
  ideas[].query
  ideas[].suggestions[]
  total_usage.total_credits_used
  total_usage.credits_remaining
  billing.credits_used
  took_ms

examples:
  caphub search-ideas '{"queries":["best robot vacuum"]}'
  caphub search-ideas '{"queries":["best robot vacuum","EV discounts Thailand"],"country":"th","language":"en"}'
`;

const SHOPPING_HELP = `caphub shopping

Server-side shopping capability.

Use shopping when you need product comparison across retailers, prices, and ratings.

commands:
  shopping <json>  Search products server-side; requires auth; 2 credits per query, up to 5 queries in parallel

routing:
  products, prices, and retailers             caphub shopping
  general cited web research                  caphub search
  local places and reviews                    caphub maps

response fields:
  queries[].query
  queries[].country
  queries[].language
  results[].query
  results[].items[].title
  results[].items[].source
  results[].items[].link
  results[].items[].price
  results[].items[].rating
  results[].items[].rating_count
  results[].items[].product_id
  total_usage.total_credits_used
  total_usage.credits_remaining
  billing.credits_used
  took_ms

examples:
  caphub shopping '{"queries":["apple m5 pro"]}'
  caphub shopping '{"queries":["apple m5 pro","wireless headphones"],"country":"us","language":"en"}'
`;

const REDDIT_HELP = `caphub reddit

Hybrid Reddit capability.

Use Reddit when you need discovery of what people are saying, then posts, comments, and user history efficiently. Reddit search runs server-side and costs credits. Feed, post, and user reads run locally and cost 0 credits.

commands:
  reddit search <json>  Search Reddit posts server-side; requires auth; 1 credit
  reddit feed <json>    Fetch subreddit feed locally; no auth; 0 credits
  reddit post <json>    Fetch post content and comments locally; no auth; 0 credits
  reddit user <json>    Fetch user posts or comments locally; no auth; 0 credits

routing:
  latest/top posts in a known subreddit    caphub reddit feed
  known Reddit post ID or URL              caphub reddit post
  known Reddit username                    caphub reddit user
  topic discovery across Reddit            caphub reddit search

response fields:
  search:
    query
    subreddit
    time
    results[].title
    results[].url
    results[].post_id
    results[].subreddit
    results[].snippet
    results[].date
    billing.credits_used
    result_count
    took_ms

  feed:
    subreddit
    sort
    time
    posts[].id
    posts[].title
    posts[].url
    posts[].subreddit
    posts[].author
    posts[].score
    posts[].num_comments
    posts[].created_utc

  post:
    id
    title
    url
    subreddit
    author
    score
    num_comments
    created_utc
    selftext
    comments[]

  user:
    username
    type
    items[]

examples:
  caphub reddit search '{"query":"qwen3 8b","subreddit":"LocalLLaMA","time":"month","limit":10}'
  caphub reddit feed '{"subreddit":"worldnews","sort":"new","limit":25}'
  caphub reddit feed '{"subreddit":"LocalLLaMA","sort":"top","time":"week","limit":10}'
  caphub reddit post '{"id":"1kaqi3k","comments":"top","comment_limit":20,"comment_depth":3}'
  caphub reddit user '{"username":"Ok-Contribution9043","type":"comments","limit":10}'
`;

const X_HELP = `caphub x

Server-side X capability.

Use X when you need compact profile data, tweets, media, follower or following lists, comments on a post, or search results from X/Twitter without dragging large raw payloads into context.

queue behavior:
  when X is busy, the CLI auto-waits and polls for a slot instead of forcing manual retry loops
  default queue policy waits up to 60s while there are at most 15 requests ahead

commands:
  x user <json>       Fetch one or more X profiles server-side; requires auth; 1 credit
  x tweets <json>     Fetch tweets from a user server-side; requires auth; 1 credit
  x media <json>      Fetch media tweets from a user server-side; requires auth; 1 credit
  x followers <json>  Fetch followers from a user server-side; requires auth; 1 credit
  x following <json>  Fetch following from a user server-side; requires auth; 1 credit
  x comments <json>   Fetch comments for a known post server-side; requires auth; 1 credit
  x search <json>     Search X posts and people server-side; requires auth; 1 credit

routing:
  known username or user id                   caphub x user
  authored posts from one account             caphub x tweets
  only posts with media from one account      caphub x media
  inspect audience or network                 caphub x followers / caphub x following
  known post id reply thread                  caphub x comments
  broad topic discovery on X                  caphub x search

response fields:
  user:
    users[].id
    users[].username
    users[].name
    users[].bio
    users[].location
    users[].created_at
    users[].verified
    users[].blue_verified
    users[].followers_count
    users[].following_count
    users[].tweet_count
    user_count
    billing.credits_used
    took_ms

  tweets:
    tweets[].id
    tweets[].created_at
    tweets[].text
    tweets[].author.id
    tweets[].author.username
    tweets[].author.name
    tweets[].metrics.likes
    tweets[].metrics.replies
    tweets[].metrics.retweets
    tweets[].metrics.quotes
    tweets[].metrics.views
    tweet_count
    billing.credits_used
    took_ms

  media:
    tweets[]
    tweet_count
    billing.credits_used
    took_ms

  followers:
    users[]
    user_count
    billing.credits_used
    took_ms

  following:
    users[]
    user_count
    billing.credits_used
    took_ms

  comments:
    comments[]
    comment_count
    billing.credits_used
    took_ms

  search:
    query
    type
    users[]
    user_count
    tweets[]
    tweet_count
    billing.credits_used
    took_ms

examples:
  caphub x user '{"username":"elonmusk"}'
  caphub x user '{"ids":["2455740283","44196397"]}'
  caphub x tweets '{"username":"MrBeast","count":10}'
  caphub x media '{"username":"MrBeast","count":10}'
  caphub x followers '{"user_id":"2455740283","count":20}'
  caphub x following '{"user_id":"2455740283","count":20}'
  caphub x comments '{"post_id":"2037151073639563267","count":20}'
  caphub x search '{"query":"bangkok","type":"Top","count":10}'
`;

const JOBS_HELP = `caphub jobs

Server-side jobs capability.

Use jobs indeed when you need description-rich job discovery in one call. Use jobs linkedin when you need richer LinkedIn filters such as workplace type, experience level, employment type, or organization IDs.

commands:
  jobs indeed <json>    Search Indeed jobs server-side; requires auth; 1 credit
  jobs linkedin <json>  Search LinkedIn jobs server-side; requires auth; 1 credit

routing:
  description-rich job search in one call         caphub jobs indeed
  LinkedIn filters like remote or hybrid          caphub jobs linkedin
  organization-based LinkedIn filtering           caphub jobs linkedin

notes:
  Indeed descriptions are trimmed to 5000 characters.
  Some normalized filters are LinkedIn-only. With include_meta true, ignored_filters shows what was not applied.

response fields:
  indeed:
    search.query
    search.country
    search.location
    search.sort_by
    jobs[].id
    jobs[].title
    jobs[].company_name
    jobs[].location
    jobs[].posted_at
    jobs[].job_url
    jobs[].description
    jobs[].source
    job_count
    next_token
    billing.credits_used
    took_ms

  linkedin:
    search.query
    search.location
    search.date_posted
    jobs[].id
    jobs[].title
    jobs[].company_name
    jobs[].location
    jobs[].posted_at
    jobs[].posted_time_ago
    jobs[].employment_type
    jobs[].job_url
    jobs[].company_profile_url
    jobs[].source
    job_count
    next_token
    billing.credits_used
    took_ms

examples:
  caphub jobs indeed '{"query":"United Nations programme officer","country":"us","location":"New York","sort_by":"relevance"}'
  caphub jobs indeed '{"query":"sports software engineer","country":"us","location":"Remote","sort_by":"date"}'
  caphub jobs linkedin '{"query":"English teacher","location":"Bangkok","date_posted":"month"}'
  caphub jobs linkedin '{"query":"growth marketing manager","location":"Singapore","workplace_types":["remote","hybrid"],"experience_levels":["associate","mid_senior"],"employment_types":["fulltime"]}'
`;

const YOUTUBE_HELP = `caphub youtube

Hybrid YouTube capability.

Use YouTube when you need relevant videos, creator or playlist context, or a transcript from a known video. Local transcript reads are free when the machine can reach YouTube directly. Server-side search, channel, playlist, and transcript fallback actions are available when discovery or hosted access is needed.

commands:
  youtube transcript <json>         Fetch transcript locally; no auth; 0 credits
  youtube transcript-server <json>  Fetch transcript server-side; requires auth; 2 credits
  youtube search <json>             Search YouTube videos server-side; requires auth; 1 credit
  youtube channel-resolve <json>    Resolve @handle/URL/UC... ID server-side; requires auth; 0 credits
  youtube channel-search <json>     Search within a channel server-side; requires auth; 1 credit
  youtube channel-videos <json>     List channel uploads page-by-page server-side; requires auth; 1 credit per page
  youtube channel-latest <json>     Fetch latest 15 channel videos server-side; requires auth; 0 credits
  youtube playlist-videos <json>    List playlist videos page-by-page server-side; requires auth; 1 credit per page

routing:
  known video id/url + local machine            caphub youtube transcript
  known video id/url + no local network path    caphub youtube transcript-server
  topic discovery across YouTube                caphub youtube search
  convert @handle or channel URL to UC... ID    caphub youtube channel-resolve
  search within one creator/channel             caphub youtube channel-search
  enumerate uploads from a known channel        caphub youtube channel-videos
  latest videos from a known channel            caphub youtube channel-latest
  enumerate videos from a playlist              caphub youtube playlist-videos

response fields:
  transcript:
    video_id
    title
    author
    transcript

  transcript-server:
    video_id
    language
    transcript
    billing.credits_used
    took_ms

  search:
    queries[].query
    results[].query
    results[].results[].title
    results[].results[].url
    results[].results[].video_id
    results[].results[].snippet
    results[].results[].channel
    results[].results[].duration
    results[].results[].date
    result_count
    billing.credits_used
    took_ms

  channel-resolve:
    input
    channel.id
    channel.title
    channel.handle
    billing.credits_used
    took_ms

  channel-search:
    results[]
    result_count
    billing.credits_used
    took_ms

  channel-videos:
    results[]
    continuation_token
    has_more
    billing.credits_used
    took_ms

  channel-latest:
    results[]
    result_count
    billing.credits_used
    took_ms

  playlist-videos:
    results[]
    playlist_info
    continuation_token
    has_more
    billing.credits_used
    took_ms

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

Use finance news when you need the latest coverage for a stock ticker such as NVDA, AAPL, or BRK.B. This endpoint is server-only, requires auth, and costs 1 credit per ticker query.

commands:
  finance news <json>  Fetch recent ticker news server-side; requires auth; 1 credit per ticker

routing:
  recent headlines for a known stock ticker      caphub finance news
  non-ticker company research                    use caphub search instead

response fields:
  queries[].query
  results[].query
  results[].items[].title
  results[].items[].link
  results[].items[].source_domain
  results[].items[].snippet
  results[].items[].date
  results[].items[].source
  result_count
  billing.credits_used
  total_usage.total_credits_used
  total_usage.credits_remaining
  took_ms

examples:
  caphub finance news '{"queries":["NVDA","AAPL"]}'
  caphub finance news '{"queries":["BRK.B"],"limit":20}'
`;

const NEWS_HELP = `caphub news

Server-side news capability.

Use news world when you need the latest country-level headlines.
Use news finance when you need the latest coverage for stock tickers such as NVDA, AAPL, or BRK.B.

commands:
  news world <json>    Fetch recent world news for one country server-side; requires auth; 1 credit
  news finance <json>  Fetch recent ticker news server-side; requires auth; 1 credit per ticker, up to 5 tickers in parallel

routing:
  local-language or english country news         caphub news world
  recent headlines for a known stock ticker      caphub news finance

response fields:
  world:
    country
    country_code
    language
    query
    items[].title
    items[].link
    items[].source_domain
    items[].snippet
    items[].date
    items[].source
    result_count
    billing.credits_used
    took_ms

  finance:
    queries[].query
    results[].query
    results[].items[].title
    results[].items[].link
    results[].items[].source_domain
    results[].items[].snippet
    results[].items[].date
    results[].items[].source
    result_count
    billing.credits_used
    took_ms

examples:
  caphub news world '{"country":"Hungary","language":"local"}'
  caphub news world '{"country":"Hungary","language":"english"}'
  caphub news finance '{"queries":["NVDA","AAPL"]}'
`;

const MAPS_HELP = `caphub maps

Server-side maps capability.

Use maps when you need the best places in an area, restaurants or services, or reviews before a recommendation.

commands:
  maps search <json>   Search Google Maps in a named area server-side; requires auth; 3 credits
  maps places <json>   Search places by text query server-side; requires auth; 1 credit per query
  maps reviews <json>  Fetch place reviews by CID server-side; requires auth; 1 credit per CID

routing:
  category or business type in a named area       caphub maps search
  exact place text search with location phrase    caphub maps places
  reviews for known place CID                     caphub maps reviews

response fields:
  search:
    query
    area
    resolved_area.name
    resolved_area.country
    resolved_area.latitude
    resolved_area.longitude
    places[].title
    places[].address
    places[].google_maps_url
    places[].rating
    places[].rating_count
    places[].type
    places[].website
    places[].phone_number
    places[].cid
    place_count
    billing.credits_used
    took_ms

  places:
    queries[].query
    results[].query
    results[].items[]
    result_count
    billing.credits_used
    took_ms

  reviews:
    cids[]
    sort_by
    reviews[]
    review_count
    billing.credits_used
    took_ms

examples:
  caphub maps search '{"query":"pizza","area":"Chiang Mai","zoom":11}'
  caphub maps search '{"query":"coworking","area":"Koh Phangan"}'
  caphub maps places '{"queries":["best pizza in Vienna"]}'
  caphub maps reviews '{"cids":["13290506179446267841"],"sort_by":"newest"}'
`;

const WEATHER_HELP = `caphub weather

Server-side weather capability.

Use weather forecast when you need rain and temperature for a place before making plans or recommendations. This endpoint is server-only, requires auth, and costs 1 credit per request.

commands:
  weather forecast <json>  Fetch daily weather forecast by place name server-side; requires auth; 1 credit

routing:
  rain and temperature for a named place         caphub weather forecast
  location is already a city/area name           caphub weather forecast
  local business discovery                       use caphub maps instead

examples:
  caphub weather forecast '{"location":"Koh Phangan","days":3}'
  caphub weather forecast '{"location":"Bangkok","days":1}'
`;

const COST_HELP = `caphub cost

Server-side cost management capability.

Use cost daily when you need a compact day-by-day spend breakdown by category. Use cost log when you need the recent billed event log with timestamps, endpoint names, response times, credits, and dollar-equivalent cost.

commands:
  cost daily <json>  Fetch daily cost breakdown server-side; requires auth; 0 credits
  cost log <json>    Fetch recent cost log server-side; requires auth; 0 credits

routing:
  budget and trend tracking by day                 caphub cost daily
  recent billed event inspection                   caphub cost log
  plan next calls around remaining spend           use cost daily before more paid calls

examples:
  caphub cost daily '{"days":30}'
  caphub cost log '{"limit":50}'
`;

const TRAVEL_HELP = `caphub travel

Server-side travel capability.

Use travel airport-resolve when you need candidate airports for a flight search.
Use travel flights when you need one-way or round-trip flight offers compared for a route and dates.
Use travel hotels when you need a destination-level hotel shortlist with price signals.
Use travel hotel when you need room availability and pricing for one specific hotel.

commands:
  travel airport-resolve <json>  Resolve airport code, airport name, or city/municipality to candidate airports; requires auth; 1 credit
  travel flights <json>  Search flights server-side; requires auth; 5 credits
  travel hotels <json>   Search hotels in a destination server-side; requires auth; 2 credits
  travel hotel <json>    Fetch one hotel's room pricing server-side; requires auth; 2 credits

routing:
  city name, airport name, or unknown airport code     caphub travel airport-resolve
  compare flight options for a route and dates      caphub travel flights
  compare hotel options in a destination            caphub travel hotels
  inspect one specific hotel                        caphub travel hotel
  final checkout or booking                         use the browser after research

response fields:
  airport-resolve:
    query
    matches[].type
    matches[].code
    matches[].name
    matches[].municipality
    matches[].country
    matches[].airport_type
    matches[].match_score
    matches[].match_reason
    match_count
    billing.credits_used
    took_ms

  flights:
    search.origin
    search.destination
    search.departDate
    search.returnDate
    search.tripType
    search.cabinClass
    currency
    offers[]
    price_insights.low
    price_insights.high
    price_insights.relative_level
    offer_count
    billing.credits_used
    took_ms

  hotels:
    destination
    checkin_date
    checkout_date
    applied_filters
    budget_per_night
    properties[].hotel_booking_id
    properties[].name
    properties[].price
    properties[].price_string
    properties[].review_score
    properties[].review_count
    properties[].room_type
    properties[].location
    properties[].booking_url
    property_count
    billing.credits_used
    took_ms

  hotel:
    hotel_booking_id
    hotel_name
    matched_name
    checkin_date
    checkout_date
    booking_url
    rooms[].room_type
    rooms[].room_economy
    rooms[].guests
    rooms[].price_as_number
    rooms[].price
    room_count
    billing.credits_used
    took_ms

examples:
  caphub travel airport-resolve '{"query":"Heathrow","country":"GB"}'
  caphub travel airport-resolve '{"query":"JFK","country":"US"}'
  caphub travel flights '{"tripType":"round-trip","origin":"LHR","destination":"JFK","departDate":"2026-06-01","returnDate":"2026-06-08","cabinClass":"business","adults":1}'
  caphub travel flights '{"tripType":"one-way","origin":"LHR","destination":"JFK","departDate":"2026-06-01","cabinClass":"business","adults":1}'
  caphub travel hotels '{"destination":"Lindos, Rhodes","checkin_date":"2026-07-01","checkout_date":"2026-07-10","adults":2,"currency":"EUR","budget_per_night":100,"filters":["free_cancellation"]}'
  caphub travel hotel '{"hotel_name":"InterContinental Dubai Marina by IHG","location":"Dubai Marina","checkin_date":"2026-05-01","checkout_date":"2026-05-10","adults":2,"currency":"EUR"}'
  caphub travel hotel '{"hotel_booking_id":"it/boffenigoboutiquegarda","checkin_date":"2026-05-01","checkout_date":"2026-05-10","adults":2,"currency":"EUR"}'
`;

function formatCategoryLabel(category) {
  return String(category || "other").replace(/(^|-)([a-z])/g, (_, sep, c) => `${sep ? " " : ""}${c.toUpperCase()}`);
}

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
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  try {
    chmodSync(CONFIG_DIR, 0o700);
  } catch {}
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    chmodSync(CONFIG_PATH, 0o600);
  } catch {}
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

function sleepMs(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, Math.max(0, Math.floor(ms) || 0)));
}

function isBlockedFetchHostname(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "local" || host.endsWith(".local")) return true;
  return false;
}

function isPrivateIpv4(address) {
  const parts = String(address || "").split(".").map((item) => Number(item));
  if (parts.length !== 4 || parts.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(address) {
  const normalized = String(address || "").trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true;
  }
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

function isPublicIpAddress(address) {
  const version = isIP(address);
  if (version === 4) return !isPrivateIpv4(address);
  if (version === 6) return !isPrivateIpv6(address);
  return false;
}

async function assertSafePublicHttpUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL is not valid");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("URL must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("URL credentials are not allowed");
  }
  if (isBlockedFetchHostname(url.hostname)) {
    throw new Error("URL hostname is not allowed");
  }

  const ipVersion = isIP(url.hostname);
  if (ipVersion) {
    if (!isPublicIpAddress(url.hostname)) throw new Error("URL hostname is not allowed");
    return url;
  }

  let resolved = [];
  try {
    resolved = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("URL hostname could not be resolved");
  }
  if (!resolved.length) {
    throw new Error("URL hostname could not be resolved");
  }
  if (resolved.some((item) => !isPublicIpAddress(item?.address || ""))) {
    throw new Error("URL hostname is not allowed");
  }

  return url;
}

async function fetchSafePublicUrl(rawUrl, init = {}) {
  let current = await assertSafePublicHttpUrl(rawUrl);

  for (let hop = 0; hop <= LOCAL_FETCH_MAX_REDIRECTS; hop += 1) {
    const resp = await fetch(current.toString(), {
      ...init,
      redirect: "manual",
    });

    if (![301, 302, 303, 307, 308].includes(resp.status)) {
      return resp;
    }
    if (hop === LOCAL_FETCH_MAX_REDIRECTS) {
      throw new Error("too many redirects");
    }

    const location = resp.headers.get("location");
    if (!location) {
      throw new Error("redirect location is missing");
    }
    current = await assertSafePublicHttpUrl(new URL(location, current).toString());
  }

  throw new Error("too many redirects");
}

function normalizePositiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function readQueueSettings() {
  const config = readConfig();
  const raw = config.queue || {};
  return {
    maxPositions: normalizePositiveInteger(
      process.env.CAPHUB_QUEUE_MAX_POSITIONS ?? raw.max_positions,
      DEFAULT_QUEUE_MAX_POSITIONS,
      { min: 1, max: 1000 },
    ),
    maxWaitMs: normalizePositiveInteger(
      process.env.CAPHUB_QUEUE_MAX_WAIT_MS ?? raw.max_wait_ms,
      DEFAULT_QUEUE_MAX_WAIT_MS,
      { min: 1000, max: 10 * 60 * 1000 },
    ),
  };
}

function isHelpArg(value) {
  return value === "--help" || value === "-h" || value === "help";
}

function isQueueResponse(error) {
  return error instanceof ApiError
    && error.status === 429
    && error.data
    && error.data.request_submitted === false
    && Number.isFinite(Number(error.data.retry_after_ms || 0))
    && Number.isFinite(Number(error.data.queue_position ?? error.data.queue_depth ?? -1));
}

function writeQueueStatus(text, { final = false } = {}) {
  if (process.stderr.isTTY) {
    process.stderr.write(`\r${text}\u001b[K`);
    if (final) process.stderr.write("\n");
    return;
  }
  process.stderr.write(`${text}\n`);
}

async function fetchJsonWithQueue(url, options, queueLabel) {
  const settings = readQueueSettings();
  const startedAt = Date.now();
  let queued = false;

  while (true) {
    try {
      const payload = await fetchJson(url, options);
      if (queued) {
        const waitedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
        writeQueueStatus(`${queueLabel}: slot acquired after ${waitedSeconds}s`, { final: true });
      }
      return payload;
    } catch (error) {
      if (!isQueueResponse(error)) throw error;

      const queuePosition = Number(error.data.queue_position ?? error.data.queue_depth ?? 0);
      const retryAfterMs = Number(error.data.retry_after_ms || DEFAULT_QUEUE_MIN_POLL_MS);
      const elapsedMs = Date.now() - startedAt;

      if (queuePosition > settings.maxPositions) {
        if (queued) writeQueueStatus(`${queueLabel}: queue aborted`, { final: true });
        throw new ApiError(
          `queue too large (${queuePosition} ahead); request not submitted; no credits charged`,
          error.status,
          error.data,
        );
      }

      const clampedDelayMs = Math.max(
        DEFAULT_QUEUE_MIN_POLL_MS,
        Math.min(DEFAULT_QUEUE_MAX_POLL_MS, retryAfterMs),
      );
      if (elapsedMs + clampedDelayMs > settings.maxWaitMs) {
        if (queued) writeQueueStatus(`${queueLabel}: queue aborted`, { final: true });
        throw new ApiError(
          `queue wait would exceed ${Math.round(settings.maxWaitMs / 1000)}s; request not submitted; no credits charged`,
          error.status,
          error.data,
        );
      }

      queued = true;
      const waitedSeconds = (elapsedMs / 1000).toFixed(1);
      writeQueueStatus(
        `${queueLabel}: ${queuePosition} ahead in queue, retrying in ${(clampedDelayMs / 1000).toFixed(1)}s, waited ${waitedSeconds}s`,
      );
      await sleepMs(clampedDelayMs);
    }
  }
}

async function serverJsonAction(url, {
  method = "POST",
  body,
  apiKey = "",
  requiresAuth = true,
  authLabel = "request",
  queueLabel = authLabel,
} = {}) {
  if (requiresAuth && !apiKey) {
    fail(`Error: ${authLabel} requires an api key because it runs server-side.\n\nnext:\n  - caphub auth login\n  - or set CAPHUB_API_KEY`);
  }
  return fetchJsonWithQueue(url, {
    method,
    apiKey,
    body,
  }, queueLabel);
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
    if (shouldFallbackToCurl(error)) {
      return fetchJsonViaCurl(url, { method, body, apiKey, originalError: error });
    }
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

function shouldFallbackToCurl(error) {
  const code = String(error?.cause?.code || "").toUpperCase();
  return code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ECONNRESET" || code === "ETIMEDOUT";
}

function fetchJsonViaCurl(url, { method, body, apiKey, originalError }) {
  return new Promise((resolveFetch, rejectFetch) => {
    const statusMarker = "__CAPHUB_STATUS__";
    const args = [
      "-sS",
      "-X",
      method,
      url,
      "-H",
      "Content-Type: application/json",
      "-w",
      `\n${statusMarker}%{http_code}`,
    ];

    if (apiKey) {
      args.push("-H", `X-API-Key: ${apiKey}`);
    }
    if (body) {
      args.push("--data", JSON.stringify(body));
    }

    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", () => {
      rejectFetch(new ApiError(`request failed: ${originalError.message}`, 0, null));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const reason = stderr.trim() || originalError.message;
        rejectFetch(new ApiError(`request failed: ${reason}`, 0, null));
        return;
      }

      const markerIndex = stdout.lastIndexOf(`\n${statusMarker}`);
      if (markerIndex === -1) {
        rejectFetch(new ApiError(`request failed: invalid curl response from ${url}`, 0, null));
        return;
      }

      const text = stdout.slice(0, markerIndex);
      const statusText = stdout.slice(markerIndex + statusMarker.length + 1).trim();
      const status = Number(statusText || 0);

      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        rejectFetch(new ApiError(`non-JSON response from ${url} (HTTP ${status || 0})`, status || 0, null));
        return;
      }

      if (status < 200 || status >= 300) {
        rejectFetch(new ApiError(data?.error || `HTTP ${status}`, status, data));
        return;
      }

      resolveFetch(data);
    });
  });
}

async function localFetchJson(url) {
  let resp;
  try {
    resp = await fetchSafePublicUrl(url, {
      headers: LOCAL_FETCH_HEADERS,
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
    resp = await fetchSafePublicUrl(url, {
      headers: LOCAL_FETCH_HEADERS,
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

async function localFetchPage(url, label) {
  let resp;
  try {
    // Keep generic page fetches on the same local path as Reddit and YouTube:
    // browser-like headers, redirects, and timeout behavior improve success on public pages.
    resp = await fetchSafePublicUrl(url, {
      headers: LOCAL_FETCH_HEADERS,
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

  return {
    url: resp.url || url,
    contentType: resp.headers.get("content-type") || "",
    text,
  };
}

async function fetchYouTubeWatchPage(videoId) {
  const fetchHtml = async (cookie = "") => {
    let resp;
    try {
      resp = await fetchSafePublicUrl(`${YOUTUBE_BASE_URL}/watch?v=${videoId}`, {
        redirect: "manual",
        headers: {
          ...LOCAL_FETCH_HEADERS,
          ...(cookie ? { Cookie: cookie } : {}),
        },
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

async function readOptionalJsonCommandInput(args, label) {
  const arg = args[0];
  const rawInput = arg ?? (process.stdin.isTTY ? "" : await readStdin());
  if (!rawInput.trim()) return {};

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

function normalizeHttpUrl(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeMaxChars(value, fallback, max) {
  const num = Number(value || fallback);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(250, Math.min(max, Math.floor(num)));
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

function stripHtmlTags(value) {
  return typeof value === "string" ? value.replace(/<[^>]+>/g, " ") : "";
}

function extractHtmlTitle(html) {
  return decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim());
}

function extractMetaContent(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["']`, "i"),
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }
  return "";
}

function htmlToReadableText(html) {
  return decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
  ).trim();
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
    await rl.question("Press Enter to open the browser login page, then enter the code shown above. Ctrl+C to cancel.");
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

function formatExpiryClock(ttlSeconds) {
  const expiresAt = new Date(Date.now() + Math.max(0, Number(ttlSeconds || 0)) * 1000);
  return expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function writeAuthSuccess(apiUrl) {
  process.stdout.write([
    "",
    "caphub is logged in and ready!",
    "",
    "agent:",
    JSON.stringify({ ok: true, config_path: CONFIG_PATH, api_url: apiUrl }, null, 2),
    "",
  ].join("\n"));
}

function shortCredits(raw) {
  if (!raw) return "—";
  const s = String(raw);
  // Extract the first "N credit(s)" mention for the table view
  const m = s.match(/(\d+)\s+credits?\b/);
  if (m) return `${m[1]} cr`;
  if (/\b0\s+credits?\b/.test(s) || s.includes("0 credits")) return "0 cr";
  return s.length > 12 ? s.slice(0, 11) + "…" : s;
}

function printCapabilities(payload) {
  const raw = Array.isArray(payload.capabilities) ? payload.capabilities : [];
  const all = [];

  for (const item of raw) {
    if (!item || item.hidden_in_capabilities === true) continue;
    const actions = item.actions && typeof item.actions === "object" ? Object.entries(item.actions) : [];
    if (item.show_actions_in_capabilities === true && actions.length > 0) {
      for (const [actionName, action] of actions) {
        all.push({
          category: item.category,
          command: `${item.capability} ${String(actionName).replace(/_/g, "-")}`,
          execution: action?.execution || item.execution,
          credits: action?.credits || item.credits,
          description: action?.description || item.description || item.purpose || "",
        });
      }
      continue;
    }
    all.push({
      category: item.category,
      command: item.capability,
      execution: item.execution,
      credits: item.credits,
      description: item.description || item.purpose || "",
    });
  }

  const grouped = new Map();
  const categoryOrder = [];
  for (const item of all) {
    const category = item.category || "other";
    if (!categoryOrder.includes(category)) categoryOrder.push(category);
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(item);
  }

  // Compute column widths across all items
  const nameW = Math.max(10, ...all.map((c) => String(c.command || "").length));
  const modeW = Math.max(4, ...all.map((c) => String(c.execution || "—").length));
  const costW = Math.max(4, ...all.map((c) => shortCredits(c.credits).length));

  const header = `  ${"command".padEnd(nameW)}  ${"mode".padEnd(modeW)}  ${"cost".padEnd(costW)}  description`;
  const divider = `  ${"─".repeat(nameW)}  ${"─".repeat(modeW)}  ${"─".repeat(costW)}  ${"─".repeat(40)}`;

  const lines = [
    "caphub capabilities",
    "",
    "Agent-facing commands available through this CLI.",
    "Run 'caphub help <capability>' for full parameters and examples.",
    "",
    header,
    divider,
  ];

  for (const category of categoryOrder) {
    const capabilities = grouped.get(category) || [];
    if (!capabilities.length) continue;

    lines.push("");
    lines.push(`  ${formatCategoryLabel(category)}`);

    for (const item of capabilities) {
      const name = String(item.command || "").padEnd(nameW);
      const mode = String(item.execution || "—").padEnd(modeW);
      const cost = shortCredits(item.credits).padEnd(costW);
      const desc = item.description || item.purpose || "";
      lines.push(`  ${name}  ${mode}  ${cost}  ${desc}`);
    }
  }

  lines.push("");
  lines.push(`${all.length} commands available. Use 'caphub help <name>' for details.`);
  process.stdout.write(`${lines.join("\n").trimEnd()}\n`);
}

function printCapabilityHelp(payload) {
  const title = payload.capability === "search"
    ? "caphub web search"
    : payload.capability === "scholar"
      ? "caphub academic search"
      : payload.capability === "patents"
        ? "caphub patent search"
        : payload.capability === "search-ideas"
          ? "caphub search ideas"
          : payload.capability === "cost"
            ? "caphub cost"
            : payload.capability === "jobs"
              ? "caphub jobs"
              : payload.capability === "shopping"
                ? "caphub product shopping"
        : payload.capability === "places"
          ? "caphub places"
          : `caphub ${payload.capability}`;
  const requestFormat = payload.capability === "jobs"
    ? "caphub jobs <action> '<request>'"
    : `caphub ${payload.capability} '<request>'`;
  const requestExample = payload.capability === "search"
    ? `caphub search '{"queries":["best AI agent frameworks 2026","autonomous coding agents"]}'`
    : payload.capability === "scholar"
      ? `caphub scholar '{"queries":["faster skin regeneration"]}'`
    : payload.capability === "patents"
      ? `caphub patents '{"queries":["faster skin regeneration"],"include_figures":false}'`
    : payload.capability === "cost"
      ? `caphub cost daily '{"days":30}'`
    : payload.capability === "jobs"
      ? `caphub jobs indeed '{"query":"United Nations programme officer","country":"us","location":"New York","sort_by":"relevance"}'`
    : payload.capability === "shopping"
      ? `caphub shopping '{"queries":["apple m5 pro"]}'`
      : payload.capability === "places"
        ? `caphub places '{"queries":["best pizza in Vienna"]}'`
        : `caphub ${payload.capability} '${JSON.stringify(payload.input_contract)}'`;
  const configuredRequestExample = payload.capability === "search"
    ? `caphub search '{"queries":["EV discounts Thailand"],"country":"th","language":"en","from_time":"week"}'`
    : payload.capability === "scholar"
      ? `caphub scholar '{"queries":["faster skin regeneration"],"country":"us","language":"en"}'`
    : payload.capability === "patents"
      ? null
    : payload.capability === "cost"
      ? `caphub cost log '{"limit":50}'`
    : payload.capability === "jobs"
      ? `caphub jobs linkedin '{"query":"growth marketing manager","location":"Singapore","workplace_types":["remote","hybrid"],"experience_levels":["associate","mid_senior"],"employment_types":["fulltime"]}'`
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
    : payload.capability === "scholar"
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
                  link: "string",
                  publication_info: "string",
                  snippet: "string",
                  year: "optional number",
                  cited_by: "optional number",
                  pdf_url: "optional http URL",
                  id: "optional string",
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
    : payload.capability === "patents"
      ? {
          queries: [
            {
              query: "string",
            },
          ],
          results: [
            {
              query: "string",
              items: [
                {
                  title: "string",
                  snippet: "string",
                  link: "string",
                  priority_date: "optional YYYY-MM-DD",
                  filing_date: "optional YYYY-MM-DD",
                  grant_date: "optional YYYY-MM-DD",
                  publication_date: "optional YYYY-MM-DD",
                  inventor: "optional string",
                  assignee: "optional string",
                  publication_number: "optional string",
                  language: "optional string",
                  thumbnail_url: "optional http URL",
                  pdf_url: "optional http URL",
                  figures: "optional figure array",
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
  const scholarParameterOrder = [
    "queries",
    "queries[] as string",
    "country",
    "language",
    "max_queries",
    "include_meta",
    "include_result_meta",
  ];
  const patentsParameterOrder = [
    "queries",
    "queries[] as string",
    "include_figures",
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
  const costParameterOrder = [
    "days",
    "limit",
  ];
  const jobsParameterOrder = [
    "query",
    "country",
    "location",
    "sort_by",
    "date_posted",
    "workplace_types",
    "experience_levels",
    "employment_types",
    "organization_ids",
    "token",
    "include_meta",
  ];
  const preferredParameterOrder = payload.capability === "search"
    ? searchParameterOrder
    : payload.capability === "scholar"
      ? scholarParameterOrder
    : payload.capability === "patents"
      ? patentsParameterOrder
    : payload.capability === "cost"
      ? costParameterOrder
    : payload.capability === "jobs"
      ? jobsParameterOrder
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
    requestFormat,
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
  if (!sub || isHelpArg(sub)) {
    process.stdout.write(REDDIT_HELP);
    return;
  }
  if (isHelpArg(args[1])) {
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
  const payload = await serverJsonAction(`${getApiUrl()}/v1/finance/${action}`, {
    apiKey,
    body,
    requiresAuth,
    authLabel: `finance ${action}`,
    queueLabel: `finance ${action}`,
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function newsServerAction(action, args, { requiresAuth = true } = {}) {
  const body = await readJsonCommandInput(args, `news ${action}`);
  const apiKey = getApiKey();
  const payload = await serverJsonAction(`${getApiUrl()}/v1/news/${action}`, {
    apiKey,
    body,
    requiresAuth,
    authLabel: `news ${action}`,
    queueLabel: `news ${action}`,
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function mapsServerAction(action, args, { requiresAuth = true } = {}) {
  const body = await readJsonCommandInput(args, `maps ${action}`);
  const apiKey = getApiKey();
  const payload = await serverJsonAction(`${getApiUrl()}/v1/maps/${action}`, {
    apiKey,
    body,
    requiresAuth,
    authLabel: `maps ${action}`,
    queueLabel: `maps ${action}`,
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function xServerAction(action, args, { requiresAuth = true } = {}) {
  const body = await readJsonCommandInput(args, `x ${action}`);
  const apiKey = getApiKey();
  const payload = await serverJsonAction(`${getApiUrl()}/v1/x/${action}`, {
    apiKey,
    body,
    requiresAuth,
    authLabel: `x ${action}`,
    queueLabel: `x ${action}`,
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function jobsServerAction(action, args, { requiresAuth = true } = {}) {
  const body = await readJsonCommandInput(args, `jobs ${action}`);
  const apiKey = getApiKey();
  const payload = await serverJsonAction(`${getApiUrl()}/v1/jobs/${action}`, {
    apiKey,
    body,
    requiresAuth,
    authLabel: `jobs ${action}`,
    queueLabel: `jobs ${action}`,
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function weatherServerAction(action, args, { requiresAuth = true } = {}) {
  const body = await readJsonCommandInput(args, `weather ${action}`);
  const apiKey = getApiKey();
  const payload = await serverJsonAction(`${getApiUrl()}/v1/weather/${action}`, {
    apiKey,
    body,
    requiresAuth,
    authLabel: `weather ${action}`,
    queueLabel: `weather ${action}`,
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function costServerAction(action, args, { requiresAuth = true } = {}) {
  const body = await readOptionalJsonCommandInput(args, `cost ${action}`);
  const apiKey = getApiKey();
  if (requiresAuth && !apiKey) {
    fail(`Error: cost ${action} requires an api key because it runs server-side.\n\nnext:\n  - caphub auth login\n  - or set CAPHUB_API_KEY`);
  }

  const url = new URL(`${getApiUrl()}/v1/cost/${action}`);
  for (const [key, value] of Object.entries(body)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const payload = await fetchJson(url.toString(), {
    method: "GET",
    apiKey,
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function travelServerAction(action, args, { requiresAuth = true } = {}) {
  const body = await readJsonCommandInput(args, `travel ${action}`);
  const apiKey = getApiKey();
  const payload = await serverJsonAction(`${getApiUrl()}/v1/travel/${action}`, {
    apiKey,
    body,
    requiresAuth,
    authLabel: `travel ${action}`,
    queueLabel: `travel ${action}`,
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function youtubeServerAction(action, args, { requiresAuth = true } = {}) {
  const body = await readJsonCommandInput(args, `youtube ${action}`);
  const apiKey = getApiKey();
  const payload = await serverJsonAction(`${getApiUrl()}/v1/youtube/${action}`, {
    apiKey,
    body,
    requiresAuth,
    authLabel: `youtube ${action}`,
    queueLabel: `youtube ${action}`,
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function youtubeTranscript(args) {
  const body = await readJsonCommandInput(args, "youtube transcript");
  const payload = await fetchLocalYouTubeTranscript(body);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function fetchPage(args) {
  const body = await readJsonCommandInput(args, "fetch page");
  const url = normalizeHttpUrl(body.url);
  if (!url) fail("Error: url is required and must be an http or https URL.");

  const includeHtml = normalizeBoolean(body.include_html, false);
  const maxChars = normalizeMaxChars(body.max_chars, 12000, 50000);
  const htmlMaxChars = normalizeMaxChars(body.html_max_chars, maxChars, 50000);

  let page;
  try {
    page = await localFetchPage(url, "local page fetch");
  } catch (error) {
    fail(`Error: ${error.message}`);
  }

  const title = extractHtmlTitle(page.text);
  const description = extractMetaContent(page.text, "description")
    || extractMetaContent(page.text, "og:description");
  const text = htmlToReadableText(page.text).slice(0, maxChars);

  process.stdout.write(`${JSON.stringify({
    action: "page",
    local: true,
    billing: { credits_used: 0 },
    url,
    final_url: page.url,
    content_type: page.contentType || null,
    title: title || null,
    description: description || null,
    text,
    ...(includeHtml ? { html: page.text.slice(0, htmlMaxChars) } : {}),
  }, null, 2)}\n`);
}

async function commandFetch(args) {
  const sub = args[0];
  if (!sub || isHelpArg(sub)) {
    process.stdout.write(FETCH_HELP);
    return;
  }
  if (isHelpArg(args[1])) {
    process.stdout.write(FETCH_HELP);
    return;
  }

  if (sub === "page") {
    await fetchPage(args.slice(1));
    return;
  }

  fail("Error: fetch actions are: page.");
}

async function commandYouTube(args) {
  const sub = args[0];
  if (!sub || isHelpArg(sub)) {
    process.stdout.write(YOUTUBE_HELP);
    return;
  }
  if (isHelpArg(args[1])) {
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
  if (!sub || isHelpArg(sub)) {
    process.stdout.write(FINANCE_HELP);
    return;
  }
  if (isHelpArg(args[1])) {
    process.stdout.write(FINANCE_HELP);
    return;
  }

  if (sub === "news") {
    await financeServerAction("news", args.slice(1));
    return;
  }

  fail("Error: finance actions are: news.");
}

async function commandNews(args) {
  const sub = args[0];
  if (!sub || isHelpArg(sub)) {
    process.stdout.write(NEWS_HELP);
    return;
  }
  if (isHelpArg(args[1])) {
    process.stdout.write(NEWS_HELP);
    return;
  }

  if (sub === "world") {
    await newsServerAction("world", args.slice(1));
    return;
  }
  if (sub === "finance") {
    await newsServerAction("finance", args.slice(1));
    return;
  }

  fail("Error: news actions are: world, finance.");
}

async function commandMaps(args) {
  const sub = args[0];
  if (!sub || isHelpArg(sub)) {
    process.stdout.write(MAPS_HELP);
    return;
  }
  if (isHelpArg(args[1])) {
    process.stdout.write(MAPS_HELP);
    return;
  }

  if (sub === "search") {
    await mapsServerAction("search", args.slice(1));
    return;
  }
  if (sub === "places") {
    await mapsServerAction("places", args.slice(1));
    return;
  }
  if (sub === "reviews") {
    await mapsServerAction("reviews", args.slice(1));
    return;
  }

  fail("Error: maps actions are: search, places, reviews.");
}

async function commandWeather(args) {
  const sub = args[0];
  if (!sub || isHelpArg(sub)) {
    process.stdout.write(WEATHER_HELP);
    return;
  }
  if (isHelpArg(args[1])) {
    process.stdout.write(WEATHER_HELP);
    return;
  }

  if (sub === "forecast") {
    await weatherServerAction("forecast", args.slice(1));
    return;
  }

  fail("Error: weather actions are: forecast.");
}

async function commandJobs(args) {
  const sub = args[0];
  if (!sub || isHelpArg(sub)) {
    process.stdout.write(JOBS_HELP);
    return;
  }
  if (isHelpArg(args[1])) {
    process.stdout.write(JOBS_HELP);
    return;
  }

  if (sub === "indeed") {
    await jobsServerAction("indeed", args.slice(1));
    return;
  }

  if (sub === "linkedin") {
    await jobsServerAction("linkedin", args.slice(1));
    return;
  }

  fail("Error: jobs actions are: indeed, linkedin.");
}

async function commandX(args) {
  const sub = args[0];
  if (!sub || isHelpArg(sub)) {
    process.stdout.write(X_HELP);
    return;
  }
  if (isHelpArg(args[1])) {
    process.stdout.write(X_HELP);
    return;
  }

  if (sub === "user") {
    await xServerAction("user", args.slice(1));
    return;
  }
  if (sub === "tweets") {
    await xServerAction("tweets", args.slice(1));
    return;
  }
  if (sub === "media") {
    await xServerAction("media", args.slice(1));
    return;
  }
  if (sub === "followers") {
    await xServerAction("followers", args.slice(1));
    return;
  }
  if (sub === "following") {
    await xServerAction("following", args.slice(1));
    return;
  }
  if (sub === "comments") {
    await xServerAction("comments", args.slice(1));
    return;
  }
  if (sub === "search") {
    await xServerAction("search", args.slice(1));
    return;
  }

  fail("Error: x actions are: user, tweets, media, followers, following, comments, search.");
}

async function commandTravel(args) {
  const sub = args[0];
  if (!sub || isHelpArg(sub)) {
    process.stdout.write(TRAVEL_HELP);
    return;
  }
  if (isHelpArg(args[1])) {
    process.stdout.write(TRAVEL_HELP);
    return;
  }

  if (sub === "flights") {
    await travelServerAction("flights", args.slice(1));
    return;
  }

  if (sub === "hotels") {
    await travelServerAction("hotels", args.slice(1));
    return;
  }

  if (sub === "hotel") {
    await travelServerAction("hotel", args.slice(1));
    return;
  }

  if (sub === "airport-resolve") {
    await travelServerAction("resolve", args.slice(1));
    return;
  }

  if (sub === "resolve") {
    await travelServerAction("resolve", args.slice(1));
    return;
  }

  fail("Error: travel actions are: airport-resolve, flights, hotels, hotel.");
}

async function commandCost(args) {
  const sub = args[0];
  if (!sub || isHelpArg(sub)) {
    process.stdout.write(COST_HELP);
    return;
  }
  if (isHelpArg(args[1])) {
    process.stdout.write(COST_HELP);
    return;
  }

  if (sub === "daily") {
    await costServerAction("daily", args.slice(1));
    return;
  }

  if (sub === "log") {
    await costServerAction("log", args.slice(1));
    return;
  }

  fail("Error: cost actions are: daily, log.");
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
  if (capability === "search") {
    process.stdout.write(SEARCH_HELP);
    return;
  }
  if (capability === "scholar") {
    process.stdout.write(SCHOLAR_HELP);
    return;
  }
  if (capability === "patents") {
    process.stdout.write(PATENTS_HELP);
    return;
  }
  if (capability === "search-ideas") {
    process.stdout.write(SEARCH_IDEAS_HELP);
    return;
  }
  if (capability === "shopping") {
    process.stdout.write(SHOPPING_HELP);
    return;
  }
  if (capability === "x") {
    process.stdout.write(X_HELP);
    return;
  }
  if (capability === "jobs") {
    process.stdout.write(JOBS_HELP);
    return;
  }
  if (capability === "fetch") {
    process.stdout.write(FETCH_HELP);
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
  if (capability === "news") {
    process.stdout.write(NEWS_HELP);
    return;
  }
  if (capability === "maps") {
    process.stdout.write(MAPS_HELP);
    return;
  }
  if (capability === "weather") {
    process.stdout.write(WEATHER_HELP);
    return;
  }
  if (capability === "travel") {
    process.stdout.write(TRAVEL_HELP);
    return;
  }
  if (capability === "cost") {
    process.stdout.write(COST_HELP);
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
        "-----------------",
        "",
        "Caphub is the simplest way to give your AI agent access to the real world.",
        "Instead of making the agent open pages, click through flows, and burn tokens on browser steps, Caphub returns clean JSON in one call with fresh data.",
        "",
        "If you have not created an account yet, visit caphub.io to register for free and get 500 credits per month.",
        "",
        "To continue with CLI login:",
        `  code: ${started.code}`,
        `  expires at: ${formatExpiryClock(started.expires_in_seconds)}`,
        "  press Enter to open the browser login page",
        "  then enter this code in the dashboard and approve login",
        "",
      ].join("\n"));

      const opened = await waitForEnterToOpen(started.approval_url);
      const followupLines = [];
      if (process.env.CAPHUB_NO_OPEN === "1") {
        followupLines.push("Browser open is disabled by CAPHUB_NO_OPEN=1.");
        followupLines.push(`Open this URL manually: ${started.approval_url}`);
      } else if (!opened) {
        followupLines.push("Browser open did not start.");
        followupLines.push(`Open this URL manually: ${started.approval_url}`);
      }
      followupLines.push("Waiting for website approval...");
      followupLines.push("");
      process.stdout.write(followupLines.join("\n"));

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
          writeAuthSuccess(apiUrl);
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
    writeAuthSuccess(apiUrl);
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

  const payload = await serverJsonAction(`${getApiUrl()}/v1/${capability}`, {
    apiKey,
    body,
    requiresAuth: true,
    authLabel: `capability "${capability}"`,
    queueLabel: capability,
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

  if (cmd === "x") {
    await commandX(args.slice(1));
    return;
  }

  if (cmd === "jobs") {
    await commandJobs(args.slice(1));
    return;
  }

  if (cmd === "fetch") {
    await commandFetch(args.slice(1));
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

  if (cmd === "news") {
    await commandNews(args.slice(1));
    return;
  }

  if (cmd === "maps") {
    await commandMaps(args.slice(1));
    return;
  }

  if (cmd === "cost") {
    await commandCost(args.slice(1));
    return;
  }

  if (cmd === "weather") {
    await commandWeather(args.slice(1));
    return;
  }

  if (cmd === "travel") {
    await commandTravel(args.slice(1));
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
