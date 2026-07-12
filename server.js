require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fetch = require('node-fetch');
const AbortController = require('abort-controller');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');
const compression = require('compression');

function safeFetch(url, opts, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs || 10000);
  return fetch(url, Object.assign({}, opts || {}, { signal: controller.signal })).finally(function() { clearTimeout(timer); });
}

var DATA_DIR = process.env.RENDER_DISK_PATH || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {} }

var USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
function sanitizeInput(str) { return (str || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20); }
function escapeHtml(str) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

var app = express();
app.use(compression());
app.use(express.json());
try { var helmet = require('helmet'); app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false })); } catch(e) {}
var port = process.env.PORT || 5000;
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('[SECURITY] WARNING: JWT_SECRET not set in .env!'); JWT_SECRET = crypto.randomBytes(32).toString('hex'); }
var ADMIN_USER = process.env.ADMIN_USER || 'admin';
var ADMIN_PASS = process.env.ADMIN_PASS;
if (!ADMIN_PASS) { console.error('[SECURITY] CRITICAL: ADMIN_PASS not set in .env!'); ADMIN_PASS = crypto.randomBytes(16).toString('hex'); }

// VAPID keys for Web Push
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BAG7sHqLzcMVKLy7djmbvZv_c51035-_YrBPujsBQkDEh4svYCTTYkPIruG1T0RstmV2Kjk4o83kPzy5YLN8dhM';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '6rIqNH9ewGspl19PmUq1ZNlG-RWH2Qf6V1NytaCmLTk';
const VAPID_EMAIL = 'mailto:admin@mjkbettingtips.com';
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Serve VAPID public key to frontend
app.get('/api/vapid-key', function(req, res) { res.json({ key: VAPID_PUBLIC_KEY }); });

const FB_API_KEY = process.env.FOOTBALL_DATA_API_KEY || '';
const FB_API_BASE = 'https://api.football-data.org/v4';
const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID || '';
const WHATSAPP_INSTANCE_ID = process.env.WHATSAPP_INSTANCE_ID || '';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || '+27677834591';

const RESULTS_FILE = path.join(DATA_DIR, 'tracked_results.json');
const ELO_FILE = path.join(DATA_DIR, 'elo_ratings.json');
const CALIB_FILE = path.join(DATA_DIR, 'calibration.json');
const FORM_FILE = path.join(DATA_DIR, 'form_tracker.json');
const WEIGHTS_FILE = path.join(DATA_DIR, 'adaptive_weights.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const APIKEYS_FILE = path.join(DATA_DIR, 'api_keys.json');
const TELEGRAM_FILE = path.join(DATA_DIR, 'telegram_subs.json');
const SPORT_PREFS_FILE = path.join(DATA_DIR, 'sport_prefs.json');

// === Advanced AI data files ===
const TEAM_STATS_FILE = path.join(DATA_DIR, 'team_stats.json');
const H2H_FILE = path.join(DATA_DIR, 'head_to_head.json');
const MATCH_DATES_FILE = path.join(DATA_DIR, 'match_dates.json');
const MODEL_COEFFS_FILE = path.join(DATA_DIR, 'model_coeffs.json');
const FEATURE_LOG_FILE = path.join(DATA_DIR, 'feature_log.json');
const SPORT_HEALTH_FILE = path.join(DATA_DIR, 'sport_health.json');
const CACHED_ODDS_FILE = path.join(DATA_DIR, 'cached_odds.json');
const RACING_EVENTS_FILE = path.join(DATA_DIR, 'racing_events.json');
const TG_WARNINGS_FILE = path.join(DATA_DIR, 'tg_warnings.json');
const TG_LAST_PROMO_FILE = path.join(DATA_DIR, 'tg_last_promo.json');
const PUSH_SUBS_FILE = path.join(DATA_DIR, 'push_subscriptions.json');

const HORSE_RACING_API_KEY = process.env.HORSE_RACING_API_KEY || ''; // Reserved for future paid API
const HORSE_RACING_API_BASE = 'https://api.odds-api.net/v1';
const RACING_JSON_URL = 'https://www.racingandsports.com.au/todays-racing-json-v2';
const RACING_FORM_BASE = 'https://www.racingandsports.com.au/form-guide';
const TAB_NEWS_URL = 'https://news.tab.co.za';
const DARTS_API_KEY = process.env.DARTS_SPORTDEVS_API_KEY || '';
const SPORTMONKS_API_KEY = process.env.SPORTMONKS_API_KEY || '';
const SPORTMONKS_API_BASE = 'https://api.sportmonks.com/v3/football';

const SPORTS = [
  { key: 'soccer_fifa_world_cup', name: 'FIFA World Cup', icon: '\u26BD' },
  { key: 'soccer_epl', name: 'EPL', icon: '\u26BD' },
  { key: 'tennis_atp_wimbledon', name: 'Wimbledon (ATP)', icon: '\uD83C\uDFBE' },
  { key: 'tennis_wta_wimbledon', name: 'Wimbledon (WTA)', icon: '\uD83C\uDFBE' },
  { key: 'americanfootball_nfl', name: 'NFL', icon: '\uD83C\uDFC8' },
  { key: 'rugbyleague_nrl', name: 'NRL', icon: '\uD83C\uDFC9' },
  { key: 'baseball_mlb', name: 'MLB', icon: '\u26BE' },
  { key: 'aussierules_afl', name: 'AFL', icon: '\uD83C\uDFC9' },
  { key: 'cricket_international_t20', name: 'T20 Cricket', icon: '\uD83C\uDFCF' },
  { key: 'mma_mixed_martial_arts', name: 'MMA/UFC', icon: '\uD83E\uDD4A' },
  { key: 'darts_pdc', name: 'PDC Darts', icon: '\uD83C\uDFAF' }
];

const COUNTRY_MAP = {
  'soccer_fifa_world_cup': 'International',
  'soccer_epl': 'England',
  'tennis_atp_wimbledon': 'United Kingdom',
  'tennis_wta_wimbledon': 'United Kingdom',
  'americanfootball_nfl': 'USA',
  'rugbyleague_nrl': 'Australia',
  'baseball_mlb': 'USA',
  'aussierules_afl': 'Australia',
  'cricket_international_t20': 'International',
  'mma_mixed_martial_arts': 'International',
  'darts_pdc': 'International',
  'horse_racing': 'International'
};

// === Per-sport config for specialized predictions ===
const SPORT_CONFIG = {
  'soccer_fifa_world_cup': { hasDraw: true, homeAdv: 1.20, kFactor: 32, formWindow: 5, minConf: 68, maxConf: 96, usePoisson: true, dcRho: -0.13 },
  'soccer_epl': { hasDraw: true, homeAdv: 1.20, kFactor: 32, formWindow: 5, minConf: 68, maxConf: 96, usePoisson: true, dcRho: -0.13 },
  'tennis_atp_wimbledon': { hasDraw: false, homeAdv: 1.05, kFactor: 48, formWindow: 3, minConf: 65, maxConf: 96, usePoisson: false, dcRho: 0 },
  'tennis_wta_wimbledon': { hasDraw: false, homeAdv: 1.05, kFactor: 48, formWindow: 3, minConf: 65, maxConf: 96, usePoisson: false, dcRho: 0 },
  'americanfootball_nfl': { hasDraw: false, homeAdv: 1.15, kFactor: 40, formWindow: 4, minConf: 65, maxConf: 95, usePoisson: false, dcRho: 0 },
  'rugbyleague_nrl': { hasDraw: true, homeAdv: 1.15, kFactor: 36, formWindow: 4, minConf: 65, maxConf: 95, usePoisson: false, dcRho: -0.08 },
  'baseball_mlb': { hasDraw: false, homeAdv: 1.10, kFactor: 36, formWindow: 5, minConf: 65, maxConf: 95, usePoisson: false, dcRho: 0 },
  'aussierules_afl': { hasDraw: true, homeAdv: 1.15, kFactor: 36, formWindow: 4, minConf: 65, maxConf: 95, usePoisson: false, dcRho: -0.08 },
  'cricket_international_t20': { hasDraw: false, homeAdv: 1.10, kFactor: 36, formWindow: 4, minConf: 65, maxConf: 95, usePoisson: false, dcRho: 0 },
  'mma_mixed_martial_arts': { hasDraw: false, homeAdv: 1.0, kFactor: 48, formWindow: 3, minConf: 65, maxConf: 95, usePoisson: false, dcRho: 0 },
  'darts_pdc': { hasDraw: false, homeAdv: 1.0, kFactor: 32, formWindow: 3, minConf: 65, maxConf: 95, usePoisson: false, dcRho: 0 },
  'horse_racing': { hasDraw: false, homeAdv: 1.0, kFactor: 32, formWindow: 3, minConf: 60, maxConf: 92, usePoisson: false, dcRho: 0 }
};
function getCfg(key) { return SPORT_CONFIG[key] || { hasDraw: true, homeAdv: 1.10, kFactor: 32, formWindow: 5, minConf: 68, maxConf: 96, usePoisson: false, dcRho: 0 }; }

const TIERS = {
  free:  { name: 'Free', tipLimit: 3, earlyAccess: false, bankersOnly: false, sportFiltering: false, accaBuilder: false, roiDashboard: false, telegramAlerts: false, monthlyReport: false, horseRacing: false, apiAccess: false, price: 0 },
  starter: { name: 'Starter', tipLimit: 10, earlyAccess: false, bankersOnly: false, sportFiltering: false, accaBuilder: false, roiDashboard: false, telegramAlerts: true, monthlyReport: false, horseRacing: false, apiAccess: false, price: 700 },
  pro: { name: 'Pro', tipLimit: 25, earlyAccess: false, bankersOnly: false, sportFiltering: false, accaBuilder: true, roiDashboard: true, telegramAlerts: true, monthlyReport: false, horseRacing: true, apiAccess: false, price: 2500 },
  elite: { name: 'Elite', tipLimit: 30, earlyAccess: true, bankersOnly: true, sportFiltering: true, accaBuilder: true, roiDashboard: true, telegramAlerts: true, monthlyReport: true, horseRacing: true, apiAccess: true, price: 6570 }
};

let teamRatings = {};
try { teamRatings = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'team_ratings.json'), 'utf8')); } catch (e) { teamRatings = {}; }
let cachedTips = [];
let lastGenerated = null;
let cachedOdds = {};
let oddsFetchDate = '';
let trackedTips = [];
let eloRatings = {};
let calibration = { buckets: {} };
let formTracker = {};
let adaptiveWeights = {};

// === Advanced AI state ===
let teamStats = {};
let headToHead = {};
let matchDates = {};
let modelCoeffs = {};
let featureLogs = [];
let sportHealth = {};
let disabledSports = {};

// === Real standings data from football-data.org ===
const COMPETITION_MAP = {
  'PL': 'soccer_epl',
  'PD': 'soccer_laliga',
  'SA': 'soccer_seriea',
  'BL1': 'soccer_bundesliga',
  'FL1': 'soccer_ligue1',
  'CL': 'soccer_champions_league',
  'WC': 'soccer_fifa_world_cup',
  'BSA': 'soccer_brasileirao'
};
var standingsData = {};
var standingsDate = '';
const STANDINGS_FILE = path.join(DATA_DIR, 'standings_cache.json');

const K_FACTOR = 32;
const ELO_BASE = 1500;
const HOME_ADVANTAGE_ELO = 50;

function loadJSON(file, def) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return def; } }
function saveJSON(file, data) { try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch (e) { console.error('[DATA] Save failed for ' + path.basename(file) + ': ' + (e.message || e).slice(0, 100)); } }

// === Advanced AI loaders ===
function loadTeamStats() { teamStats = loadJSON(TEAM_STATS_FILE, {}); }
function saveTeamStats() { saveJSON(TEAM_STATS_FILE, teamStats); }
function loadH2H() { headToHead = loadJSON(H2H_FILE, {}); }
function saveH2H() { saveJSON(H2H_FILE, headToHead); }
function loadMatchDates() { matchDates = loadJSON(MATCH_DATES_FILE, {}); }
function saveMatchDates() { saveJSON(MATCH_DATES_FILE, matchDates); }
function loadModelCoeffs() { modelCoeffs = loadJSON(MODEL_COEFFS_FILE, {}); }
function saveModelCoeffs() { saveJSON(MODEL_COEFFS_FILE, modelCoeffs); }
function loadFeatureLogs() { featureLogs = loadJSON(FEATURE_LOG_FILE, []); }
function saveFeatureLogs() { saveJSON(FEATURE_LOG_FILE, featureLogs); }
function loadSportHealth() { var h = loadJSON(SPORT_HEALTH_FILE, {}); sportHealth = h.sportHealth || {}; disabledSports = h.disabledSports || {}; }
function saveSportHealth() { saveJSON(SPORT_HEALTH_FILE, { sportHealth: sportHealth, disabledSports: disabledSports }); }
function loadCachedOdds() { cachedOdds = loadJSON(CACHED_ODDS_FILE, {}); }
function saveCachedOdds() { saveJSON(CACHED_ODDS_FILE, cachedOdds); }

// === REAL STANDINGS DATA FROM FOOTBALL-DATA.ORG ===
function loadStandingsCache() { standingsData = loadJSON(STANDINGS_FILE, {}); if (standingsData._date) standingsDate = standingsData._date; }
function saveStandingsCache() { saveJSON(STANDINGS_FILE, standingsData); }

function stripClubSuffix(name) {
  return name.replace(/\s+(FC|CF|SC|AC|AS|SS|RC|CD|UD|SD|BK|IF|FF|SK|FK|TK|AK|IK|OK|HK|VK|KRC|KAA|RSC|OSC|VfB|VfL|TSG|SC\sFreiburg|SC\sPaderborn)$/gi, '').trim();
}

function fuzzyMatchTeam(query, teamNames) {
  var q = normalizeTeamName(query).toLowerCase().trim();
  var qs = stripClubSuffix(q);
  for (var i = 0; i < teamNames.length; i++) {
    var tn = teamNames[i].toLowerCase().trim();
    var tns = stripClubSuffix(tn);
    if (q === tn || qs === tns) return teamNames[i];
    if (tn.indexOf(qs) >= 0 || qs.indexOf(tns) >= 0) return teamNames[i];
  }
  var qw = q.split(/\s+/);
  for (var i = 0; i < teamNames.length; i++) {
    var tn = teamNames[i].toLowerCase();
    var matches = 0;
    for (var wi = 0; wi < qw.length; wi++) { if (tn.indexOf(qw[wi]) >= 0) matches++; }
    if (matches >= Math.ceil(qw.length * 0.7)) return teamNames[i];
  }
  return null;
}

function computeFormRate(formArray) {
  if (!formArray || formArray.length === 0) return 0.5;
  var pts = 0;
  for (var i = 0; i < formArray.length; i++) {
    var f = formArray[i].trim().toUpperCase();
    if (f === 'W') pts += 3;
    else if (f === 'D') pts += 1;
  }
  return pts / (formArray.length * 3);
}

async function fetchStandingsData() {
  if (!FB_API_KEY) { console.log('[STANDINGS] No API key, skipping'); return; }
  var today = new Date().toISOString().split('T')[0];
  if (standingsDate === today && standingsData._teams && Object.keys(standingsData._teams).length > 10) {
    console.log('[STANDINGS] Using cached data (' + Object.keys(standingsData._teams).length + ' teams)');
    return;
  }
  loadStandingsCache();
  var codes = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL'];
  var allTeams = {};
  for (var ci = 0; ci < codes.length; ci++) {
    // Try current season first
    var loaded = await loadCompetitionStandings(codes[ci], null, allTeams);
    // If current season has no real data (pre-season), fetch last season
    if (!loaded) {
      var lastSeason = new Date().getFullYear() - 1;
      await loadCompetitionStandings(codes[ci], lastSeason, allTeams);
    }
  }
  standingsData = { _teams: allTeams, _date: today };
  standingsDate = today;
  saveStandingsCache();
  console.log('[STANDINGS] Total: ' + Object.keys(allTeams).length + ' real teams loaded');
}

async function loadCompetitionStandings(code, season, allTeams) {
  try {
    var url = FB_API_BASE + '/competitions/' + code + '/standings' + (season ? '?season=' + season : '');
    var res = await fetch(url, { headers: { 'X-Auth-Token': FB_API_KEY } });
    if (!res.ok) { console.log('[STANDINGS] ' + code + (season ? '/' + season : '') + ' HTTP ' + res.status); return false; }
    var data = await res.json();
    if (!data.standings) return false;
    var hasRealData = false;
    for (var si = 0; si < data.standings.length; si++) {
      var st = data.standings[si];
      if (st.type !== 'TOTAL') continue;
      for (var ti = 0; ti < st.table.length; ti++) {
        var entry = st.table[ti];
        if (!entry.team) continue;
        var name = entry.team.name;
        var id = entry.team.id;
        var played = entry.playedGames || 0;
        if (played > 5) hasRealData = true;
        var gf = entry.goalsFor || 0;
        var ga = entry.goalsAgainst || 0;
        var avgGF = played > 0 ? gf / played : 1.3;
        var avgGA = played > 0 ? ga / played : 1.3;
        var formArr = entry.form ? entry.form.split(',').map(function(f) { return f.trim().toUpperCase(); }) : [];
        var attRating = Math.max(3, Math.min(10, 5 + (avgGF - 0.8) * 3));
        var defRating = Math.max(3, Math.min(10, 5 + (2.0 - avgGA) * 3));
        var eloBase = ELO_BASE + ((entry.position || 10) <= 4 ? 150 : (entry.position || 10) <= 10 ? 50 : (entry.position || 10) >= 17 ? -100 : 0);
        var eloFromPts = played > 0 ? Math.round((entry.points || 0) / played * 12) : 0;
        // Only update if we don't have this team, or if new data has more games
        var existing = allTeams[name];
        if (!existing || played > existing.played) {
          allTeams[name] = {
            id: id, name: name, comp: code,
            attack: attRating, defense: defRating,
            form: formArr, formRate: computeFormRate(formArr),
            won: entry.won || 0, draw: entry.draw || 0, lost: entry.lost || 0,
            points: entry.points || 0, goalsFor: gf, goalsAgainst: ga,
            position: entry.position || 0, played: played,
            avgGF: avgGF, avgGA: avgGA,
            elo: eloBase + eloFromPts,
            season: season || 'current'
          };
        }
      }
    }
    var teamCount = data.standings.reduce(function(acc, s) { return acc + (s.table ? s.table.length : 0); }, 0);
    console.log('[STANDINGS] ' + code + (season ? '/' + season : '') + ': ' + teamCount + ' teams' + (hasRealData ? '' : ' (pre-season, fallback)'));
    return hasRealData;
  } catch (e) { console.log('[STANDINGS] ' + code + ' error: ' + (e.message || e).slice(0, 100)); return false; }
}

function lookupStandingsTeam(teamName) {
  if (!standingsData._teams) return null;
  var keys = Object.keys(standingsData._teams);
  if (keys.length === 0) return null;
  var match = fuzzyMatchTeam(teamName, keys);
  return match ? standingsData._teams[match] : null;
}

// Fetch recent matches for real H2H data
async function fetchRealH2H(homeTeamName, awayTeamName) {
  if (!FB_API_KEY) return null;
  var homeS = lookupStandingsTeam(homeTeamName);
  var awayS = lookupStandingsTeam(awayTeamName);
  if (!homeS || !awayS || !homeS.id || !awayS.id) return null;
  try {
    var res = await fetch(FB_API_BASE + '/teams/' + homeS.id + '/matches?status=FINISHED&limit=20', { headers: { 'X-Auth-Token': FB_API_KEY } });
    if (!res.ok) return null;
    var data = await res.json();
    if (!data.matches) return null;
    var h2hResults = [];
    var awayName = stripClubSuffix(awayTeamName.toLowerCase());
    for (var i = 0; i < data.matches.length; i++) {
      var m = data.matches[i];
      var homeName = m.homeTeam ? stripClubSuffix(m.homeTeam.name.toLowerCase()) : '';
      var awName = m.awayTeam ? stripClubSuffix(m.awayTeam.name.toLowerCase()) : '';
      if (homeName.indexOf(awayName) >= 0 || awName.indexOf(awayName) >= 0) {
        if (m.score && m.score.fullTime) {
          h2hResults.push({ home: m.homeTeam.name, away: m.awayTeam.name, hg: m.score.fullTime.home, ag: m.score.fullTime.away, date: m.utcDate });
        }
      }
    }
    if (h2hResults.length === 0) return null;
    var homeWins = 0, awayWins = 0, draws = 0;
    for (var i = 0; i < h2hResults.length; i++) {
      if (h2hResults[i].hg > h2hResults[i].ag) homeWins++;
      else if (h2hResults[i].ag > h2hResults[i].hg) awayWins++;
      else draws++;
    }
    return { homeWins: homeWins, awayWins: awayWins, draws: draws, total: h2hResults.length, results: h2hResults.slice(0, 5) };
  } catch (e) { return null; }
}

// === BROWSER RESEARCH: Scrape real-time stats from public sources ===
var researchCache = {};
var RESEARCH_TTL = 3600000; // 1 hour
var revokedTokens = {};

function revokeToken(token) { revokedTokens[token] = Date.now(); }
function cleanRevokedTokens() { var now = Date.now(); for (var t in revokedTokens) { if (now - revokedTokens[t] > 7 * 86400000) delete revokedTokens[t]; } }
function cleanResearchCache() { var now = Date.now(); for (var k in researchCache) { if (now - researchCache[k].ts > RESEARCH_TTL * 2) delete researchCache[k]; } }

async function researchTeamStats(teamName) {
  var cacheKey = teamName.toLowerCase();
  if (researchCache[cacheKey] && (Date.now() - researchCache[cacheKey].ts) < RESEARCH_TTL) return researchCache[cacheKey];
  var result = { team: teamName, news: [], injuries: [], recentForm: null, source: 'web' };
  try {
    // Source 1: Football-data.org team endpoint (recent matches for form)
    var realTeam = lookupStandingsTeam(teamName);
    if (realTeam && realTeam.id && FB_API_KEY) {
      var season = new Date().getFullYear();
      var res = await fetch(FB_API_BASE + '/teams/' + realTeam.id + '/matches?status=FINISHED&limit=6&season=' + season, { headers: { 'X-Auth-Token': FB_API_KEY } });
      if (res.ok) {
        var data = await res.json();
        if (data.matches && data.matches.length > 0) {
          var formResults = [];
          for (var i = 0; i < data.matches.length; i++) {
            var m = data.matches[i];
            if (!m.score || !m.score.fullTime) continue;
            var isHome = m.homeTeam && m.homeTeam.id === realTeam.id;
            var hg = isHome ? m.score.fullTime.home : m.score.fullTime.away;
            var ag = isHome ? m.score.fullTime.away : m.score.fullTime.home;
            var opp = isHome ? (m.awayTeam ? m.awayTeam.name : '?') : (m.homeTeam ? m.homeTeam.name : '?');
            var matchResult = hg > ag ? 'W' : (hg < ag ? 'L' : 'D');
            formResults.push({ opponent: opp, score: hg + '-' + ag, result: matchResult, date: m.utcDate });
          }
          result.recentForm = formResults;
          result.formString = formResults.map(function(r) { return r.result; }).join('');
          // Infer injuries from missing players in recent lineups (simplified)
        }
      }
    }
  } catch (e) {}
  try {
    // Source 2: Research complete
  } catch (e) {}
  researchCache[cacheKey] = result;
  return result;
}

async function researchMatchStats(homeTeam, awayTeam) {
  var homeResearch = await researchTeamStats(homeTeam);
  var awayResearch = await researchTeamStats(awayTeam);
  return {
    home: homeResearch,
    away: awayResearch,
    h2h: await fetchRealH2H(homeTeam, awayTeam),
    timestamp: Date.now()
  };
}

// === STANDALONE TIPS FROM REAL STATS (no odds API needed) ===
async function buildStatsBasedTip(home, away, league, kickoff, sportKey) {
  var cfg = getCfg(sportKey);
  var hStats = getAttackDefense(sportKey, home, true);
  var aStats = getAttackDefense(sportKey, away, false);

  // Run Poisson with real data
  var poisson = dcPoissonPrediction(hStats.attack, hStats.defense, aStats.attack, aStats.defense, sportKey);

  // ELO from real standings
  var fmHome = formModifier(sportKey, home);
  var fmAway = formModifier(sportKey, away);
  var adjHome = Math.max(1000, Math.min(2000, getElo(sportKey, home) + HOME_ADVANTAGE_ELO + fmHome));
  var adjAway = Math.max(1000, Math.min(2000, getElo(sportKey, away) + fmAway));
  var eloProb = expectedScore(adjHome, adjAway);

  // Research real-time form
  var research = await researchMatchStats(home, away);

  // Blend: 40% Poisson, 35% ELO, 25% form
  var formH = research.home && research.home.recentForm ? computeFormRate(research.home.formString.split('')) : 0.5;
  var formA = research.away && research.away.recentForm ? computeFormRate(research.away.formString.split('')) : 0.5;
  var formAdv = (formH - formA) * 0.25;

  var predHome = poisson.homeWin * 0.40 + eloProb * 0.35 + (0.5 + formAdv) * 0.25;
  var predDraw = poisson.draw * 0.40 + 0.25 * 0.35;
  var predAway = poisson.awayWin * 0.40 + (1 - eloProb) * 0.35 + (0.5 - formAdv) * 0.25;
  var total = predHome + predDraw + predAway;
  if (total > 0) { predHome /= total; predDraw /= total; predAway /= total; }

  // Pick best outcome
  var pick = '', conf = 0, odds = '', mr = 'Match Result';
  var h2hData = getH2H(sportKey, home, away);
  if (predHome > predAway && predHome > predDraw && predHome > 0.35) {
    pick = home + ' to Win'; conf = Math.round(predHome * 100);
    odds = predHome > 0.05 ? (1 / predHome * 0.92).toFixed(2) : '5.00';
  } else if (predAway > predHome && predAway > predDraw && predAway > 0.35) {
    pick = away + ' to Win'; conf = Math.round(predAway * 100);
    odds = predAway > 0.05 ? (1 / predAway * 0.92).toFixed(2) : '5.00';
  } else if (predHome > 0.30 && predDraw > 0.25) {
    pick = home + ' or Draw'; mr = 'Double Chance'; conf = Math.round((predHome + predDraw) * 100);
    odds = (predHome + predDraw) > 0.05 ? (1 / (predHome + predDraw) * 0.92).toFixed(2) : '2.00';
  } else {
    return null;
  }
  conf = Math.min(92, Math.max(68, conf));
  conf = calibrateConfidence(conf);

  var features = buildFeatures(home, away, sportKey);
  var rc = [];
  if (hStats.source === 'standings') rc.push('REAL');
  rc.push('Pois+' + poisson.expectedHomeGoals.toFixed(1) + '-' + poisson.expectedAwayGoals.toFixed(1));
  rc.push('Elo ' + Math.round(adjHome) + 'v' + Math.round(adjAway));
  if (research.home && research.home.formString) rc.push('F' + research.home.formString);
  if (research.away && research.away.formString) rc.push('F' + research.away.formString);
  if (h2hData) rc.push('H2H' + h2hData.total);
  rc.push('NO-ODDS');

  return {
    type: sportKey, sport: 'Football', icon: '\u26BD',
    match: home + ' vs ' + away, league: league || 'Football',
    country: COUNTRY_MAP[sportKey] || '',
    marketType: 'h2h', market: mr, marketLine: null,
    kickoff: kickoff, pick: pick, odds: odds, conf: conf,
    realOdds: null, bookmaker: '', valueBet: false,
    reason: 'AI [' + mr + '] ' + rc.join(' | '), features: features
  };
}

// === AUTH ===
function hashPassword(pw) {
  var salt = crypto.randomBytes(16).toString('hex');
  var hash = crypto.pbkdf2Sync(pw, salt, 10000, 64, 'sha512').toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(pw, stored) {
  var parts = stored.split(':');
  var salt = parts[0], hash = parts[1];
  return crypto.pbkdf2Sync(pw, salt, 10000, 64, 'sha512').toString('hex') === hash;
}
function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, tier: user.tier, role: user.role || 'user' }, JWT_SECRET, { expiresIn: '7d' });
}
function authMiddleware(req, res, next) {
  var header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    var token = header.split(' ')[1];
    if (revokedTokens[token]) return res.status(401).json({ error: 'Token revoked' });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  }
  catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
}
function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// === RATE LIMITER ===
var rateLimitStore = {};
function rateLimit(windowMs, maxRequests) {
  return function(req, res, next) {
    var ip = req.ip || req.connection.remoteAddress || 'unknown';
    var now = Date.now();
    if (!rateLimitStore[ip] || now - rateLimitStore[ip].windowStart > windowMs) {
      rateLimitStore[ip] = { windowStart: now, count: 1 };
    } else {
      rateLimitStore[ip].count++;
    }
    if (rateLimitStore[ip].count > maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}
setInterval(function() {
  var now = Date.now();
  for (var ip in rateLimitStore) {
    if (now - rateLimitStore[ip].windowStart > 300000) delete rateLimitStore[ip];
  }
}, 300000);

// === PUSH NOTIFICATIONS ===
function loadPushSubs() { return loadJSON(PUSH_SUBS_FILE, []); }
function savePushSubs(s) { saveJSON(PUSH_SUBS_FILE, s); }

async function sendPushNotification(subscription, title, body, url) {
  try {
    var payload = JSON.stringify({ title: title, body: body, url: url || '/' });
    await webpush.sendNotification(subscription, payload);
    return true;
  } catch (e) {
    if (e.statusCode === 410 || e.statusCode === 404) return false; // subscription expired
    console.log('[PUSH] Send error:', e.message);
    return false;
  }
}

async function sendPushToAll(title, body, url) {
  var subs = loadPushSubs();
  var failed = [];
  for (var i = 0; i < subs.length; i++) {
    var ok = await sendPushNotification(subs[i], title, body, url);
    if (!ok) failed.push(i);
  }
  if (failed.length > 0) {
    var fresh = subs.filter(function(_, idx) { return failed.indexOf(idx) === -1; });
    savePushSubs(fresh);
    console.log('[PUSH] Removed ' + failed.length + ' expired subscriptions');
  }
  return subs.length - failed.length;
}

// === LIVE ODDS ===
async function fetchLiveOdds(sport) {
  if (!ODDS_API_KEY) return null;
  try {
    var url = ODDS_API_BASE + '/' + sport + '/odds/?apiKey=' + ODDS_API_KEY + '&regions=za&markets=h2h';
    var resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) { return null; }
}

function loadUsers() { return loadJSON(USERS_FILE, {}); }
function saveUsers(u) { saveJSON(USERS_FILE, u); }
function loadApiKeys() { return loadJSON(APIKEYS_FILE, {}); }
function saveApiKeys(k) { saveJSON(APIKEYS_FILE, k); }
function loadTelegramSubs() { return loadJSON(TELEGRAM_FILE, []); }
function saveTelegramSubs(s) { saveJSON(TELEGRAM_FILE, s); }
function loadSportPrefs() { return loadJSON(SPORT_PREFS_FILE, {}); }
function saveSportPrefs(p) { saveJSON(SPORT_PREFS_FILE, p); }

function initAdmin() {
  var users = loadUsers();
  if (!users[ADMIN_USER]) {
    users[ADMIN_USER] = { id: 'admin-1', username: ADMIN_USER, password: hashPassword(ADMIN_PASS), tier: 'elite', role: 'admin', createdAt: new Date().toISOString(), subs: {} };
    saveUsers(users);
    console.log('[AUTH] Admin account created: ' + ADMIN_USER);
  }
}
initAdmin();

// === ELO (unchanged) ===
function loadElo() { eloRatings = loadJSON(ELO_FILE, {}); }
function saveElo() { saveJSON(ELO_FILE, eloRatings); }
function getElo(sportKey, teamName) {
  if (!eloRatings[sportKey]) eloRatings[sportKey] = {};
  if (eloRatings[sportKey][teamName] === undefined) {
    // PRIORITY 1: Initialize from real standings data
    var realTeam = lookupStandingsTeam(teamName);
    if (realTeam && realTeam.elo) {
      eloRatings[sportKey][teamName] = { elo: realTeam.elo, games: realTeam.played || 0 };
    } else {
      const rating = teamRatings[teamName];
      if (rating) { const avg = (rating.attack + rating.defense + rating.form) / 3; eloRatings[sportKey][teamName] = { elo: Math.round(ELO_BASE + (avg - 7) * 100), games: 0 }; }
      else { eloRatings[sportKey][teamName] = { elo: ELO_BASE, games: 0 }; }
    }
    saveElo();
  }
  return eloRatings[sportKey][teamName].elo;
}
function expectedScore(eloA, eloB) { return 1 / (1 + Math.pow(10, (eloB - eloA) / 400)); }
function updateElo(sportKey, teamA, teamB, scoreA, k) {
  if (!eloRatings[sportKey]) eloRatings[sportKey] = {};
  if (eloRatings[sportKey][teamA] === undefined) eloRatings[sportKey][teamA] = { elo: ELO_BASE, games: 0 };
  if (eloRatings[sportKey][teamB] === undefined) eloRatings[sportKey][teamB] = { elo: ELO_BASE, games: 0 };
  const eloA = eloRatings[sportKey][teamA].elo, eloB = eloRatings[sportKey][teamB].elo;
  const expectedA = expectedScore(eloA, eloB);
  eloRatings[sportKey][teamA].elo = Math.round(eloA + k * (scoreA - expectedA));
  eloRatings[sportKey][teamB].elo = Math.round(eloB + k * ((1 - scoreA) - (1 - expectedA)));
  eloRatings[sportKey][teamA].games++; eloRatings[sportKey][teamB].games++;
  saveElo();
}

// === FORM (extended) ===
function loadForm() { formTracker = loadJSON(FORM_FILE, {}); }
function saveForm() { saveJSON(FORM_FILE, formTracker); }
function updateForm(sportKey, teamA, teamB, scoreA) {
  if (!formTracker[sportKey]) formTracker[sportKey] = {};
  for (const [team, s] of [[teamA, scoreA], [teamB, 1 - scoreA]]) {
    if (!formTracker[sportKey][team]) formTracker[sportKey][team] = { form: [] };
    const label = s === 1 ? 'W' : (s === 0.5 ? 'D' : 'L');
    formTracker[sportKey][team].form.push(label);
    if (formTracker[sportKey][team].form.length > 10) formTracker[sportKey][team].form.shift();
  }
  saveForm();
}
function formModifier(sportKey, teamName) {
  // PRIORITY 1: Real form from football-data.org standings
  var realTeam = lookupStandingsTeam(teamName);
  if (realTeam && realTeam.form && realTeam.form.length >= 3) {
    var w = 0, l = 0;
    for (var i = 0; i < realTeam.form.length; i++) {
      if (realTeam.form[i] === 'W') w++;
      else if (realTeam.form[i] === 'L') l++;
    }
    return (w - l) * 12;
  }
  // PRIORITY 2: Learned form from resolved tips
  if (!formTracker[sportKey] || !formTracker[sportKey][teamName]) return 0;
  const f = formTracker[sportKey][teamName].form;
  if (f.length < 3) return 0;
  const fw = f.filter(x => x === 'W').length, fl = f.filter(x => x === 'L').length;
  return (fw - fl) * 8;
}
function getFormWindow(sportKey, team, windowSize) {
  // PRIORITY 1: Real form from football-data.org standings
  var realTeam = lookupStandingsTeam(team);
  if (realTeam && realTeam.form && realTeam.form.length >= 2) {
    var recentForm = realTeam.form.slice(-windowSize);
    var w = 0, d = 0, l = 0;
    for (var i = 0; i < recentForm.length; i++) {
      if (recentForm[i] === 'W') w++;
      else if (recentForm[i] === 'D') d++;
      else if (recentForm[i] === 'L') l++;
    }
    return { wins: w, draws: d, losses: l, total: recentForm.length, rate: recentForm.length > 0 ? (w * 3 + d) / (recentForm.length * 3) : 0.5, source: 'standings' };
  }
  // PRIORITY 2: Learned form
  if (!formTracker[sportKey] || !formTracker[sportKey][team]) return null;
  const f = formTracker[sportKey][team].form;
  const learnedRecent = f.slice(-windowSize);
  const lw = learnedRecent.filter(x => x === 'W').length;
  const ld = learnedRecent.filter(x => x === 'D').length;
  const ll = learnedRecent.filter(x => x === 'L').length;
  return { wins: lw, draws: ld, losses: ll, total: learnedRecent.length, rate: learnedRecent.length > 0 ? (lw * 3 + ld) / (learnedRecent.length * 3) : 0.5, source: 'learned' };
}

// === ADAPTIVE WEIGHTS (unchanged) ===
function loadWeights() { adaptiveWeights = loadJSON(WEIGHTS_FILE, {}); }
function saveWeights() { saveJSON(WEIGHTS_FILE, adaptiveWeights); }
function getWeights(sportKey) {
  if (!adaptiveWeights[sportKey]) {
    const isSoccer = sportKey.startsWith('soccer_');
    adaptiveWeights[sportKey] = isSoccer ? { eloWeight: 0.30, poissonWeight: 0.35, marketWeight: 0.35, samples: 0 } : { eloWeight: 0.50, poissonWeight: 0, marketWeight: 0.50, samples: 0 };
    saveWeights();
  }
  return adaptiveWeights[sportKey];
}
function updateWeights(sportKey, wasCorrect) {
  const w = getWeights(sportKey);
  if (w.samples > 200) return;
  const lr = 1 / (w.samples + 10);
  w.eloWeight += lr * ((wasCorrect ? 1 : 0) - w.eloWeight);
  w.marketWeight += lr * ((wasCorrect ? 1 : 0) - w.marketWeight);
  const total = w.eloWeight + w.marketWeight + w.poissonWeight;
  w.eloWeight /= total; w.marketWeight /= total; w.poissonWeight /= total;
  w.samples++; saveWeights();
}

// === CALIBRATION (unchanged) ===
function loadCalibration() { calibration = loadJSON(CALIB_FILE, { buckets: {} }); if (!calibration.buckets) calibration.buckets = {}; }
function saveCalibration() { saveJSON(CALIB_FILE, calibration); }
function bucketKey(conf) { if (conf >= 90) return '90-96'; if (conf >= 85) return '85-89'; if (conf >= 80) return '80-84'; if (conf >= 75) return '75-79'; return '70-74'; }
function recordCalibration(conf, won) {
  const bk = bucketKey(conf);
  if (!calibration.buckets[bk]) calibration.buckets[bk] = { won: 0, lost: 0 };
  calibration.buckets[bk][won ? 'won' : 'lost']++;
  saveCalibration();
}
function calibrateConfidence(rawConf) {
  loadCalibration();
  const bk = bucketKey(rawConf);
  const b = calibration.buckets[bk];
  if (!b || (b.won + b.lost) < 5) return rawConf;
  const actualRate = b.won / (b.won + b.lost);
  if (actualRate < 0.35) return Math.min(rawConf, 45);
  if (actualRate < 0.45) return Math.min(rawConf, 55);
  if (actualRate < 0.55) return Math.min(rawConf, 65);
  if (actualRate < 0.65) return Math.min(rawConf, 75);
  if (actualRate < 0.75) return Math.min(rawConf, 82);
  return rawConf;
}

// === ADVANCED AI ENGINE ===

// --- Team Stats (Attack/Defense tracking) ---
function updateTeamStats(sportKey, home, away, hg, ag) {
  if (!teamStats[sportKey]) teamStats[sportKey] = {};
  for (const [team, gf, ga] of [[home, hg, ag], [away, ag, hg]]) {
    if (!teamStats[sportKey][team]) teamStats[sportKey][team] = { gf: 0, ga: 0, matches: 0, homeGf: 0, homeGa: 0, homeMatches: 0 };
    teamStats[sportKey][team].gf += gf;
    teamStats[sportKey][team].ga += ga;
    teamStats[sportKey][team].matches++;
    if (team === home) {
      teamStats[sportKey][team].homeGf += gf;
      teamStats[sportKey][team].homeGa += ga;
      teamStats[sportKey][team].homeMatches++;
    }
  }
  saveTeamStats();
}
function getAttackDefense(sportKey, team, isHome) {
  const cfg = getCfg(sportKey);
  // PRIORITY 1: Real standings data from football-data.org
  var realTeam = lookupStandingsTeam(team);
  if (realTeam) {
    var att = isHome ? realTeam.attack + 0.3 : realTeam.attack;
    var def = isHome ? realTeam.defense - 0.2 : realTeam.defense;
    return { attack: Math.max(3, Math.min(10, att)), defense: Math.max(3, Math.min(10, def)), form: 5 + realTeam.formRate * 5, source: 'standings' };
  }
  // PRIORITY 2: Learned stats from resolved tips
  if (teamStats[sportKey] && teamStats[sportKey][team] && teamStats[sportKey][team].matches >= 5) {
    const s = teamStats[sportKey][team];
    const useHome = isHome && s.homeMatches > 0;
    const avgGF = useHome ? s.homeGf / s.homeMatches : (s.gf - s.homeGf) / Math.max(1, s.matches - s.homeMatches);
    const avgGA = useHome ? s.homeGa / s.homeMatches : (s.ga - s.homeGa) / Math.max(1, s.matches - s.homeMatches);
    const fMod = formModifier(sportKey, team);
    return { attack: Math.max(3, Math.min(10, 7 + (avgGF - 1.3) * 1.5)), defense: Math.max(3, Math.min(10, 7 + (1.3 - avgGA) * 1.5)), form: 7 + fMod / 8, source: 'learned' };
  }
  // PRIORITY 3: Fallback defaults (minimal weight)
  const r = getDefaultRating(team);
  return { attack: r.attack, defense: r.defense, form: r.form, source: 'default' };
}

// --- Head-to-Head ---
function updateH2H(sportKey, home, away, hg, ag) {
  if (!headToHead[sportKey]) headToHead[sportKey] = {};
  const pairKey = [home, away].sort().join('|');
  if (!headToHead[sportKey][pairKey]) headToHead[sportKey][pairKey] = { homeWins: 0, awayWins: 0, draws: 0, total: 0, lastResults: [] };
  const h2h = headToHead[sportKey][pairKey];
  if (hg > ag) h2h.homeWins++;
  else if (ag > hg) h2h.awayWins++;
  else h2h.draws++;
  h2h.total++;
  h2h.lastResults.push({ home: home, away: away, hg: hg, ag: ag, date: new Date().toISOString() });
  if (h2h.lastResults.length > 10) h2h.lastResults.shift();
  saveH2H();
}
function getH2H(sportKey, home, away) {
  // PRIORITY 1: Real H2H from football-data.org (fetched on-demand in buildSoccerTip)
  var realKey = '_realH2H_' + home + '|' + away;
  if (standingsData[realKey]) return standingsData[realKey];
  // PRIORITY 2: Learned H2H from resolved tips
  if (!headToHead[sportKey]) return null;
  const pairKey = [home, away].sort().join('|');
  const h2h = headToHead[sportKey][pairKey];
  if (!h2h || h2h.total < 2) return null;
  const homeWinRate = h2h.lastResults.length > 0 && h2h.lastResults[0].home === home ? h2h.homeWins / h2h.total : h2h.awayWins / h2h.total;
  return { homeWinRate: homeWinRate, total: h2h.total };
}

// --- Fatigue ---
function updateMatchDate(team, kickoff) {
  if (!kickoff) return;
  const key = team.toLowerCase().replace(/[^a-z0-9]/g, '');
  matchDates[key] = { team: team, lastMatch: kickoff };
  saveMatchDates();
}
function getDaysSinceMatch(team) {
  const key = team.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!matchDates[key]) return 7;
  const diff = (Date.now() - new Date(matchDates[key].lastMatch).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(1, Math.min(21, diff));
}

// --- Dixon-Coles enhanced Poisson ---
function poissonProb(k, lambda) { return Math.pow(lambda, k) * Math.exp(-lambda) / (function f(n) { if (n <= 1) return 1; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; })(k); }
function dcPoissonPrediction(homeAttack, homeDefense, awayAttack, awayDefense, sportKey) {
  const cfg = getCfg(sportKey);
  const avgAttack = 7.5, avgDefense = 7.5;
  const homeOff = homeAttack / avgAttack, homeDef = homeDefense / avgDefense;
  const awayOff = awayAttack / avgAttack, awayDef = awayDefense / avgDefense;
  const lambdaHome = Math.max(0.15, homeOff * (1 / awayDef) * 1.25 * cfg.homeAdv);
  const lambdaAway = Math.max(0.15, awayOff * (1 / homeDef) * 1.05);
  const rho = cfg.dcRho || 0;
  const maxGoals = 8;
  let homeWinProb = 0, drawProb = 0, awayWinProb = 0;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      let p = poissonProb(h, lambdaHome) * poissonProb(a, lambdaAway);
      if (h === 0 && a === 0) p *= (1 + rho);
      else if ((h === 0 && a === 1) || (h === 1 && a === 0)) p *= (1 - rho);
      else if (h === 1 && a === 1) p *= (1 + rho);
      if (h > a) homeWinProb += p;
      else if (h === a) drawProb += p;
      else awayWinProb += p;
    }
  }
  const total = homeWinProb + drawProb + awayWinProb;
  if (total === 0) return { homeWin: 0.34, draw: 0.33, awayWin: 0.33, expectedHomeGoals: lambdaHome, expectedAwayGoals: lambdaAway };
  return { homeWin: homeWinProb / total, draw: drawProb / total, awayWin: awayWinProb / total, expectedHomeGoals: lambdaHome, expectedAwayGoals: lambdaAway };
}
// Keep original for backward-compat in FIFA WC path
function poissonPrediction(homeAttack, homeDefense, awayAttack, awayDefense) {
  return dcPoissonPrediction(homeAttack, homeDefense, awayAttack, awayDefense, 'soccer_epl');
}

// --- Logistic Regression ---
function buildFeatures(home, away, sportKey) {
  const cfg = getCfg(sportKey);
  const hStats = getAttackDefense(sportKey, home, true);
  const aStats = getAttackDefense(sportKey, away, false);
  const h2h = getH2H(sportKey, home, away);
  const hForm = getFormWindow(sportKey, home, cfg.formWindow);
  const aForm = getFormWindow(sportKey, away, cfg.formWindow);
  const hElo = getElo(sportKey, home);
  const aElo = getElo(sportKey, away);
  const daysH = getDaysSinceMatch(home);
  const daysA = getDaysSinceMatch(away);
  // Feature vector: [eloDiff, attDiff, formHome, formAway, h2h, fatigueHome, fatigueAway, bias]
  const eloDiff = (hElo - aElo) / 400;
  const attDiff = (hStats.attack - aStats.defense) - (aStats.attack - hStats.defense);
  return [eloDiff, attDiff, hForm ? hForm.rate : 0.5, aForm ? aForm.rate : 0.5, h2h ? h2h.homeWinRate : 0.5, Math.min(14, daysH) / 14, Math.min(14, daysA) / 14, 1];
}
function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
function predictLR(sportKey, features) {
  const m = modelCoeffs[sportKey];
  if (!m || !m.models || m.samples < 10) {
    // backward compat: old single-model format
    if (m && !m.models && m.coefficients && m.samples >= 10) {
      let z = m.intercept || 0;
      for (let i = 0; i < Math.min(features.length, m.coefficients.length); i++) z += (m.coefficients[i] || 0) * features[i];
      return sigmoid(z);
    }
    return null;
  }
  const means = m.means || [0,0,0,0,0,0,0,0];
  const stds = m.stds || [1,1,1,1,1,1,1,1];
  const norm = features.map(function(v, i) { return i < 7 && stds[i] > 0.001 ? (v - means[i]) / stds[i] : v; });
  var probs = 0, cnt = 0;
  for (var mi = 0; mi < m.models.length; mi++) {
    var sub = m.models[mi];
    if (!sub || !sub.coefficients) continue;
    var z = sub.intercept || 0;
    for (var i = 0; i < Math.min(norm.length, sub.coefficients.length); i++) z += (sub.coefficients[i] || 0) * norm[i];
    probs += sigmoid(z);
    cnt++;
  }
  return cnt > 0 ? probs / cnt : null;
}
function logFeature(sportKey, features, actualWon) {
  if (!features || features.length < 8) return;
  featureLogs.push({ sportKey: sportKey, features: features.slice(0, 8), actual: actualWon ? 1 : 0, timestamp: new Date().toISOString() });
  if (featureLogs.length > 2000) featureLogs = featureLogs.slice(-2000);
  saveFeatureLogs();
}
function trainSportModel(sportKey) {
  var raw = featureLogs.filter(function(f) { return f.sportKey === sportKey && f.features && f.features.length >= 8; });
  if (raw.length < 10) return;
  var now = Date.now();
  var totalW = 0;
  var weighted = raw.map(function(s) {
    var ageMs = now - new Date(s.timestamp).getTime();
    var ageDays = Math.max(0, ageMs / 86400000);
    var w = Math.exp(-ageDays * 0.05);
    totalW += w;
    return { features: s.features.slice(0, 8), actual: s.actual, weight: w };
  });
  if (totalW === 0) return;
  // Compute normalization stats from weighted samples (exclude bias feature index 7)
  var dim = 7;
  var means = [], stds = [];
  for (var i = 0; i < dim; i++) {
    var sum = 0, wsum = 0;
    for (var j = 0; j < weighted.length; j++) { sum += weighted[j].features[i] * weighted[j].weight; wsum += weighted[j].weight; }
    means.push(wsum > 0 ? sum / wsum : 0);
  }
  for (var i = 0; i < dim; i++) {
    var varSum = 0, wsum = 0;
    for (var j = 0; j < weighted.length; j++) { var d = weighted[j].features[i] - means[i]; varSum += d * d * weighted[j].weight; wsum += weighted[j].weight; }
    var sd = wsum > 0 ? Math.sqrt(varSum / wsum) : 1;
    stds.push(Math.max(0.001, sd));
  }
  stds.push(1); means.push(0); // bias feature: no normalization
  // Normalize features
  var normed = weighted.map(function(s) {
    var f = s.features.map(function(v, i) { return i < dim && stds[i] > 0.001 ? (v - means[i]) / stds[i] : v; });
    f[7] = 1; // bias
    return { features: f, actual: s.actual, weight: s.weight / totalW };
  });
  // Train 3-model ensemble with different LRs
  var lrs = [0.005, 0.015, 0.04];
  var models = [];
  var epochs = 500;
  for (var mi = 0; mi < lrs.length; mi++) {
    var baseLr = lrs[mi];
    var coeffs = [0, 0, 0, 0, 0, 0, 0, 0];
    var intercept = 0;
    for (var e = 0; e < epochs; e++) {
      var lr = baseLr * Math.max(0.01, 1 - e / epochs); // decay
      for (var si = 0; si < normed.length; si++) {
        var f = normed[si].features;
        var y = normed[si].actual;
        var w = normed[si].weight;
        var z = intercept;
        for (var j = 0; j < coeffs.length; j++) z += coeffs[j] * f[j];
        var pred = sigmoid(z);
        var error = pred - y;
        for (var j = 0; j < coeffs.length; j++) {
          coeffs[j] -= lr * (error * f[j] * w * normed.length + 0.0005 * coeffs[j]); // L2
        }
        intercept -= lr * error * w * normed.length;
      }
    }
    models.push({ coefficients: coeffs, intercept: intercept, lr: baseLr });
  }
  modelCoeffs[sportKey] = { models: models, means: means, stds: stds, samples: raw.length, trainedAt: new Date().toISOString() };
  saveModelCoeffs();
  console.log('[ML] Trained ensemble (' + models.length + ' models) for ' + sportKey + ' (' + raw.length + ' samples)');
}
function trainAllModels() {
  loadFeatureLogs();
  for (var si = 0; si < SPORTS.length; si++) trainSportModel(SPORTS[si].key);
}

function checkSportHealth() {
  const recentTips = trackedTips.filter(function(t) { return t.checkedAt && t.result; });
  for (var si = 0; si < SPORTS.length; si++) {
    var sk = SPORTS[si].key;
    var recent = recentTips.filter(function(t) { return t.type === sk; }).slice(-50);
    var won = recent.filter(function(t) { return t.result === 'won'; }).length;
    var total = recent.length;
    var rate = total >= 10 ? (won / total) : -1;
    if (rate >= 0 && rate < 0.40) {
      disabledSports[sk] = true;
      console.log('[HEALTH] Disabled ' + sk + ' (win rate ' + (rate * 100).toFixed(0) + '%, ' + total + ' tips)');
    } else if (rate >= 0.50) {
      delete disabledSports[sk];
    }
    sportHealth[sk] = { wins: won, total: total, rate: rate, lastChecked: new Date().toISOString() };
  }
  if (Object.keys(disabledSports).length > 0) console.log('[HEALTH] Disabled sports:', Object.keys(disabledSports).join(', '));
  saveSportHealth();
}

// === TRACKED TIPS (unchanged) ===
function loadTrackedTips() { trackedTips = loadJSON(RESULTS_FILE, []); }
function saveTrackedTips() { saveJSON(RESULTS_FILE, trackedTips); }
function tipId(tip) { return crypto.createHash('md5').update(tip.type + '|' + tip.match + '|' + tip.pick + '|' + tip.kickoff).digest('hex').slice(0, 10); }
function mergeTip(tip) {
  const id = tipId(tip);
  if (!trackedTips.find(t => t.id === id)) {
    trackedTips.push({ id: id, type: tip.type, sport: tip.sport, icon: tip.icon, match: tip.match, league: tip.league, country: tip.country, marketType: tip.marketType || 'h2h', market: tip.market, marketLine: tip.marketLine || null, pick: tip.pick, odds: tip.odds, conf: tip.conf, kickoff: tip.kickoff, result: 'pending', checkedAt: null, features: tip.features || null });
  }
}

// === HELPERS ===
const TEAM_ALIASES = { 'Congo DR': 'DR Congo', 'DR Congo': 'DR Congo', 'Bosnia': 'Bosnia & Herzegovina', 'Bosnia & Herzegovina': 'Bosnia & Herzegovina', 'USA': 'USA', 'United States': 'USA', 'Cape Verde Islands': 'Cape Verde', 'Cape Verde': 'Cape Verde', 'Ivory Coast': 'Ivory Coast', "Cote d'Ivoire": 'Ivory Coast' };
function normalizeTeamName(name) { return TEAM_ALIASES[name] || name; }
function getDefaultRating(teamName) {
  for (const key in teamRatings) { if (teamName.toLowerCase().includes(key.toLowerCase())) return teamRatings[key]; }
  return { attack: 7.0, defense: 7.0, form: 7.0 };
}
function impliedProb(decimalOdds) { return decimalOdds > 1 ? 1 / decimalOdds : 0; }
function marketConsensus(homeTeam, awayTeam, oddsMatch, sport) {
  if (!oddsMatch || !oddsMatch.bookmakers || oddsMatch.bookmakers.length === 0) return null;
  const cfg = getCfg(sport.key);
  const homeNorm = normalizeTeamName(homeTeam), awayNorm = normalizeTeamName(awayTeam);
  let homeProbs = [], awayProbs = [], drawProbs = [];
  let bestHomePrice = 0, bestAwayPrice = 0, bestDrawPrice = 0, bestHomeBook = '', bestAwayBook = '', totalBooks = 0;
  for (const bm of oddsMatch.bookmakers) {
    if (!bm.markets || bm.markets.length === 0) continue;
    const out = bm.markets[0].outcomes;
    const hO = out.find(o => normalizeTeamName(o.name) === homeNorm);
    const aO = out.find(o => normalizeTeamName(o.name) === awayNorm);
    const dO = cfg.hasDraw ? out.find(o => o.name.toLowerCase() === 'draw') : null;
    if (!hO || !aO || (cfg.hasDraw && !dO)) continue;
    totalBooks++;
    homeProbs.push(impliedProb(hO.price)); awayProbs.push(impliedProb(aO.price));
    if (cfg.hasDraw && dO) drawProbs.push(impliedProb(dO.price));
    if (hO.price > bestHomePrice) { bestHomePrice = hO.price; bestHomeBook = bm.title; }
    if (aO.price > bestAwayPrice) { bestAwayPrice = aO.price; bestAwayBook = bm.title; }
    if (dO && dO.price > bestDrawPrice) bestDrawPrice = dO.price;
  }
  if (totalBooks === 0) return null;
  const avgHome = homeProbs.reduce((a, b) => a + b, 0) / homeProbs.length;
  const avgAway = awayProbs.reduce((a, b) => a + b, 0) / awayProbs.length;
  const avgDraw = cfg.hasDraw ? drawProbs.reduce((a, b) => a + b, 0) / drawProbs.length : 0;
  const totalP = avgHome + avgAway + avgDraw;
  return { homeWin: totalP > 0 ? avgHome / totalP : 0.34, awayWin: totalP > 0 ? avgAway / totalP : 0.33, draw: totalP > 0 ? avgDraw / totalP : 0.33, agreement: Math.max(0, 1 - (Math.max(...homeProbs) - Math.min(...homeProbs) + Math.max(...awayProbs) - Math.min(...awayProbs))), bestHomePrice: bestHomePrice, bestAwayPrice: bestAwayPrice, bestDrawPrice: bestDrawPrice, bestHomeBook: bestHomeBook, bestAwayBook: bestAwayBook, totalBooks: totalBooks };
}
function confidenceFromProb(prob, agreement) {
  let base = Math.round(prob * 100);
  base = Math.min(95, Math.max(65, base));
  if (agreement > 0.7) base = Math.min(95, base + 5);
  else if (agreement < 0.3) base = Math.max(65, base - 5);
  return calibrateConfidence(base);
}

// === MULTI-MARKET PREDICTORS ===
function extractMarket(oddsMatch, marketKey) {
  if (!oddsMatch || !oddsMatch.bookmakers) return [];
  var results = [];
  for (var bi = 0; bi < oddsMatch.bookmakers.length; bi++) {
    var bm = oddsMatch.bookmakers[bi];
    if (!bm.markets) continue;
    var mkt = bm.markets.find(function(m) { return m.key === marketKey; });
    if (!mkt || !mkt.outcomes) continue;
    var book = bm.title;
    for (var oi = 0; oi < mkt.outcomes.length; oi++) {
      var out = mkt.outcomes[oi];
      results.push({ book: book, name: out.name, price: out.price, point: out.point || null });
    }
  }
  return results;
}
function bestPriceForOutcome(outcomes, name, point) {
  var best = 0, bestBook = '';
  for (var i = 0; i < outcomes.length; i++) {
    var o = outcomes[i];
    if (o.name === name && (point === undefined || point === null || o.point === point)) {
      if (o.price > best) { best = o.price; bestBook = o.book; }
    }
  }
  return { price: best, book: bestBook };
}
function predictOU(homeAttack, homeDefense, awayAttack, awayDefense, sportKey, line) {
  var lamH = Math.max(0.15, (homeAttack / 7.5) * (1 / (awayDefense / 7.5)) * 1.25 * getCfg(sportKey).homeAdv);
  var lamA = Math.max(0.15, (awayAttack / 7.5) * (1 / (homeDefense / 7.5)) * 1.05);
  var maxGoals = 12;
  var overProb = 0, underProb = 0, exactProb = 0;
  for (var h = 0; h <= maxGoals; h++) {
    for (var a = 0; a <= maxGoals; a++) {
      var p = poissonProb(h, lamH) * poissonProb(a, lamA);
      var total = h + a;
      if (total > line) overProb += p;
      else if (total < line) underProb += p;
      else exactProb += p;
    }
  }
  var t = overProb + underProb + exactProb;
  return { over: t > 0 ? overProb / t : 0.5, under: t > 0 ? underProb / t : 0.5, expectedTotal: lamH + lamA };
}
function predictBTTS(homeAttack, homeDefense, awayAttack, awayDefense, sportKey) {
  var lamH = Math.max(0.15, (homeAttack / 7.5) * (1 / (awayDefense / 7.5)) * 1.25 * getCfg(sportKey).homeAdv);
  var lamA = Math.max(0.15, (awayAttack / 7.5) * (1 / (homeDefense / 7.5)) * 1.05);
  var homeZero = Math.exp(-lamH), awayZero = Math.exp(-lamA);
  var bttsProb = 1 - homeZero - awayZero + (homeZero * awayZero);
  return { yes: Math.max(0.01, Math.min(0.99, bttsProb)), no: 1 - Math.max(0.01, Math.min(0.99, bttsProb)) };
}
function scoreMarket(aiProb, bestOdds, agreement) {
  if (bestOdds <= 0) return 0;
  var implied = 1 / bestOdds;
  var value = aiProb - implied;
  if (value <= 0) return value * 50;
  var conf = confidenceFromProb(aiProb, agreement);
  return value * 100 + (conf - 50);
}

// === ADVANCED PREDICTORS ===
async function buildSoccerTip(oddsMatch, sport) {
  if (disabledSports[sport.key]) return null;
  const home = oddsMatch.home_team, away = oddsMatch.away_team;
  const cfg = getCfg(sport.key);
  const hStats = getAttackDefense(sport.key, home, true);
  const aStats = getAttackDefense(sport.key, away, false);
  const poisson = dcPoissonPrediction(hStats.attack, hStats.defense, aStats.attack, aStats.defense, sport.key);
  const consensus = marketConsensus(home, away, oddsMatch, sport);
  const fmHome = formModifier(sport.key, home);
  const adjustedElo = Math.max(1000, Math.min(2000, getElo(sport.key, home) + HOME_ADVANTAGE_ELO + fmHome));
  const fmAway = formModifier(sport.key, away);
  const adjustedEloA = Math.max(1000, Math.min(2000, getElo(sport.key, away) + fmAway));
  const eloHomeRaw = expectedScore(adjustedElo, adjustedEloA);
  const eloDrawVal = cfg.hasDraw ? 0.25 : 0;
  const eloHome = eloHomeRaw * (1 - eloDrawVal);
  const eloAway = (1 - eloHomeRaw) * (1 - eloDrawVal);
  const w = getWeights(sport.key);
  const effectiveMarket = consensus || { homeWin: 0.34, awayWin: 0.33, draw: 0.33, agreement: 0.5, bestHomePrice: 0, bestAwayPrice: 0, bestDrawPrice: 0, bestHomeBook: '', bestAwayBook: '', totalBooks: 0 };

  // Fetch real H2H from football-data.org
  var realH2H = await fetchRealH2H(home, away);
  if (realH2H && realH2H.total >= 1) {
    var h2hKey = '_realH2H_' + home + '|' + away;
    standingsData[h2hKey] = { homeWinRate: realH2H.homeWins / realH2H.total, total: realH2H.total };
  }

  // ML model override if trained
  let mlHomeProb = null;
  if (cfg.usePoisson) {
    const features = buildFeatures(home, away, sport.key);
    const rawLR = predictLR(sport.key, features);
    if (rawLR !== null) mlHomeProb = rawLR;
  }

  // Enhanced blending with real data
  const h2hData = getH2H(sport.key, home, away);
  let pred;
  if (mlHomeProb !== null) {
    const mlAwayProb = 1 - mlHomeProb;
    const blendLR = 0.35;
    pred = { homeWin: mlHomeProb * blendLR + poisson.homeWin * w.poissonWeight + eloHome * w.eloWeight + effectiveMarket.homeWin * w.marketWeight * (1 - blendLR), awayWin: mlAwayProb * blendLR + poisson.awayWin * w.poissonWeight + eloAway * w.eloWeight + effectiveMarket.awayWin * w.marketWeight * (1 - blendLR), draw: cfg.hasDraw ? (poisson.draw * w.poissonWeight + eloDrawVal * w.eloWeight + effectiveMarket.draw * w.marketWeight * (1 - blendLR)) : 0, mlUsed: true };
  } else {
    pred = { homeWin: poisson.homeWin * w.poissonWeight + eloHome * w.eloWeight + effectiveMarket.homeWin * w.marketWeight, awayWin: poisson.awayWin * w.poissonWeight + eloAway * w.eloWeight + effectiveMarket.awayWin * w.marketWeight, draw: cfg.hasDraw ? (poisson.draw * w.poissonWeight + eloDrawVal * w.eloWeight + effectiveMarket.draw * w.marketWeight) : 0, mlUsed: false };
  }

  // Apply real H2H adjustment (15% weight on real H2H if available)
  if (h2hData && h2hData.total >= 3) {
    var h2hHomeBonus = (h2hData.homeWinRate - 0.45) * 0.15;
    pred.homeWin += h2hHomeBonus;
    pred.awayWin -= h2hHomeBonus;
  }

  const totalP = pred.homeWin + pred.awayWin + pred.draw;
  if (totalP > 0) { pred.homeWin /= totalP; pred.awayWin /= totalP; pred.draw /= totalP; }

  const features = buildFeatures(home, away, sport.key);
  const agreement = consensus ? consensus.agreement : 0.5;
  const hForm = getFormWindow(sport.key, home, cfg.formWindow);
  const aForm = getFormWindow(sport.key, away, cfg.formWindow);

  // Reason components
  let rc = [];
  if (hStats.source === 'standings') rc.push('REAL');
  if (pred.mlUsed) rc.push('ML');
  if (cfg.usePoisson) rc.push('Pois+' + poisson.expectedHomeGoals.toFixed(1) + '-' + poisson.expectedAwayGoals.toFixed(1));
  rc.push('Elo ' + Math.round(adjustedElo) + 'v' + Math.round(adjustedEloA));
  if (consensus) rc.push(consensus.totalBooks + 'bk');
  if (h2hData && h2hData.total >= 1) rc.push('H2H' + h2hData.total);
  if (hForm && aForm) rc.push('F' + hForm.wins + 'W-' + hForm.losses + 'L/' + aForm.wins + 'W-' + aForm.losses + 'L');

  // === Evaluate all markets ===
  var candidates = [];

  // 1. H2H market
  if (consensus) {
    var h2hOpts = [{ name: home + ' to Win', prob: pred.homeWin, price: consensus.bestHomePrice, book: consensus.bestHomeBook }, { name: away + ' to Win', prob: pred.awayWin, price: consensus.bestAwayPrice, book: consensus.bestAwayBook }];
    if (cfg.hasDraw) h2hOpts.push({ name: 'Draw', prob: pred.draw, price: consensus.bestDrawPrice, book: '' });
    for (var hi = 0; hi < h2hOpts.length; hi++) {
      var ho = h2hOpts[hi];
      if (ho.prob < 0.18 || ho.price <= 0) continue;
      var sv = scoreMarket(ho.prob, ho.price, agreement);
      candidates.push({ marketType: 'h2h', market: 'Match Result', pick: ho.name, odds: ho.price.toFixed(2), prob: ho.prob, conf: Math.round(ho.prob * 100), bookmaker: ho.book, valueBet: (ho.prob - (1 / ho.price)) > 0.05, score: sv, line: null });
    }
  }

  // 2. Over/Under markets (2.5, 1.5, 3.5)
  var ouLines = [2.5, 1.5, 3.5];
  var totOutcomes = extractMarket(oddsMatch, 'totals');
  for (var li = 0; li < ouLines.length; li++) {
    var line = ouLines[li];
    var ou = predictOU(hStats.attack, hStats.defense, aStats.attack, aStats.defense, sport.key, line);
    var overOdds = bestPriceForOutcome(totOutcomes, 'Over', line);
    var underOdds = bestPriceForOutcome(totOutcomes, 'Under', line);
    var ouAgree = totOutcomes.length > 4 ? 0.7 : 0.5;
    if (overOdds.price > 0 && ou.over > 0.18) {
      var sc = scoreMarket(ou.over, overOdds.price, ouAgree);
      candidates.push({ marketType: 'ou', market: 'Over/Under ' + line, pick: 'Over ' + line, odds: overOdds.price.toFixed(2), prob: ou.over, conf: Math.round(ou.over * 100), bookmaker: overOdds.book, valueBet: (ou.over - (1 / overOdds.price)) > 0.05, score: sc, line: line });
    }
    if (underOdds.price > 0 && ou.under > 0.18) {
      var sc = scoreMarket(ou.under, underOdds.price, ouAgree);
      candidates.push({ marketType: 'ou', market: 'Over/Under ' + line, pick: 'Under ' + line, odds: underOdds.price.toFixed(2), prob: ou.under, conf: Math.round(ou.under * 100), bookmaker: underOdds.book, valueBet: (ou.under - (1 / underOdds.price)) > 0.05, score: sc, line: line });
    }
  }

  // 3. BTTS market
  var btts = predictBTTS(hStats.attack, hStats.defense, aStats.attack, aStats.defense, sport.key);
  var bttsOutcomes = extractMarket(oddsMatch, 'totals');
  var yesPrice = bestPriceForOutcome(bttsOutcomes, 'Yes', null);
  if (yesPrice.price <= 0) yesPrice = bestPriceForOutcome(bttsOutcomes, 'Over', 0.5);
  if (yesPrice.price <= 0) { yesPrice.price = 0; yesPrice.book = ''; }
  var bttsAgree = bttsOutcomes.length > 4 ? 0.65 : 0.5;
  if (yesPrice.price > 0 && btts.yes > 0.18) {
    var sc = scoreMarket(btts.yes, yesPrice.price, bttsAgree);
    candidates.push({ marketType: 'btts', market: 'Both Teams to Score', pick: 'Yes', odds: yesPrice.price.toFixed(2), prob: btts.yes, conf: Math.round(btts.yes * 100), bookmaker: yesPrice.book, valueBet: (btts.yes - (1 / yesPrice.price)) > 0.05, score: sc, line: null });
  }

  // Pick best candidate
  candidates.sort(function(a, b) { return b.score - a.score; });
  if (candidates.length === 0 || candidates[0].score < 3) return null;
  var best = candidates[0];
  var reason = 'AI [' + best.market + '] ' + rc.join(' | ');
  return { type: sport.key, sport: sport.name, icon: sport.icon, match: home + ' vs ' + away, league: sport.name, country: COUNTRY_MAP[sport.key] || '', marketType: best.marketType, market: best.market, marketLine: best.line, kickoff: oddsMatch.commence_time, pick: best.pick, odds: best.odds, conf: Math.min(cfg.maxConf, Math.max(cfg.minConf, best.conf)), realOdds: consensus ? { home: consensus.bestHomePrice || null, away: consensus.bestAwayPrice || null, draw: consensus.bestDrawPrice || null } : null, bookmaker: best.bookmaker, valueBet: best.valueBet, reason: reason, features: features };
}

function buildNonSoccerTip(oddsMatch, sport) {
  if (disabledSports[sport.key]) return null;
  const home = oddsMatch.home_team, away = oddsMatch.away_team;
  const cfg = getCfg(sport.key);
  const consensus = marketConsensus(home, away, oddsMatch, sport);
  if (!consensus) return null;
  const hStats = getAttackDefense(sport.key, home, true);
  const aStats = getAttackDefense(sport.key, away, false);
  const fmHome = formModifier(sport.key, home);
  const adjustedElo = Math.max(1000, Math.min(2000, getElo(sport.key, home) + HOME_ADVANTAGE_ELO + fmHome));
  const fmAway = formModifier(sport.key, away);
  const adjustedEloA = Math.max(1000, Math.min(2000, getElo(sport.key, away) + fmAway));
  const rawElo = expectedScore(adjustedElo, adjustedEloA);
  const eloDrawVal = cfg.hasDraw ? 0.25 : 0;
  const eloHome = rawElo * (1 - eloDrawVal);
  const eloAway = (1 - rawElo) * (1 - eloDrawVal);
  const ratingDiff = ((hStats.attack + hStats.defense) - (aStats.attack + aStats.defense)) / 20;
  const w = getWeights(sport.key);
  const totalW = w.eloWeight + w.marketWeight;
  const eW = w.eloWeight / totalW, mW = w.marketWeight / totalW;

  // ML model override
  const features = buildFeatures(home, away, sport.key);
  const rawLR = predictLR(sport.key, features);
  let blendHome, blendAway, blendDraw;
  if (rawLR !== null) {
    const mlHome = rawLR, mlAway = 1 - rawLR;
    blendHome = mlHome * 0.30 + (eloHome * eW + consensus.homeWin * mW + Math.max(0, ratingDiff) * 0.1) * 0.70;
    blendAway = mlAway * 0.30 + (eloAway * eW + consensus.awayWin * mW + Math.max(0, -ratingDiff) * 0.1) * 0.70;
    blendDraw = cfg.hasDraw ? (eloDrawVal * eW + consensus.draw * mW) * 0.70 : 0;
  } else {
    blendHome = eloHome * eW + consensus.homeWin * mW + Math.max(0, ratingDiff) * 0.1;
    blendAway = eloAway * eW + consensus.awayWin * mW + Math.max(0, -ratingDiff) * 0.1;
    blendDraw = cfg.hasDraw ? (eloDrawVal * eW + consensus.draw * mW) : 0;
  }
  const totalB = blendHome + blendAway + blendDraw;
  const nHome = totalB > 0 ? blendHome / totalB : 0.5, nAway = totalB > 0 ? blendAway / totalB : 0.5, nDraw = totalB > 0 ? blendDraw / totalB : 0;

  let tipText = '', odds = '2.00', bookmaker = '', valueBet = false, reason = '', pickProb = 0;
  if (nHome > nAway && nHome > nDraw) { tipText = home + ' to Win'; pickProb = nHome; odds = consensus.bestHomePrice > 0 ? consensus.bestHomePrice.toFixed(2) : (1 / nHome).toFixed(2); bookmaker = consensus.bestHomeBook; valueBet = (nHome - (1 / consensus.bestHomePrice)) > 0.05; }
  else if (nAway > nHome && nAway > nDraw) { tipText = away + ' to Win'; pickProb = nAway; odds = consensus.bestAwayPrice > 0 ? consensus.bestAwayPrice.toFixed(2) : (1 / nAway).toFixed(2); bookmaker = consensus.bestAwayBook; valueBet = (nAway - (1 / consensus.bestAwayPrice)) > 0.05; }
  else { return null; }
  const confidence = confidenceFromProb(pickProb, consensus.agreement);
  const formNote = (Math.abs(fmHome) > 5 || Math.abs(fmAway) > 5) ? ' Form ' + (fmHome > 0 ? '+' : '') + fmHome + 'v' + (fmAway > 0 ? '+' : '') + fmAway : '';
  const h2h = getH2H(sport.key, home, away);
  const h2hNote = h2h ? ' H2H ' + h2h.total : '';
  var dataSrc = (hStats.source === 'standings') ? ' REAL' : '';
  reason = 'AI' + dataSrc + (rawLR !== null ? ' ML' : '') + ' Elo ' + Math.round(adjustedElo) + 'v' + Math.round(adjustedEloA) + formNote + h2hNote + ' ' + consensus.totalBooks + 'books';
  return { type: sport.key, sport: sport.name, icon: sport.icon, match: home + ' vs ' + away, league: sport.name, country: COUNTRY_MAP[sport.key] || '', marketType: 'h2h', market: cfg.hasDraw ? 'Match Result' : 'Match Winner', marketLine: null, kickoff: oddsMatch.commence_time, pick: tipText, odds: odds, conf: Math.min(cfg.maxConf, Math.max(cfg.minConf, confidence)), realOdds: { home: consensus.bestHomePrice || null, away: consensus.bestAwayPrice || null, draw: cfg.hasDraw ? (consensus.bestDrawPrice || null) : null }, bookmaker: bookmaker, valueBet: valueBet, reason: reason, features: features };
}

function determineWin(tip, home, away, hScore, aScore) {
  if (tip.marketType === 'ou') {
    var total = (parseInt(hScore, 10) || 0) + (parseInt(aScore, 10) || 0);
    var line = parseFloat(tip.marketLine) || 2.5;
    return tip.pick.indexOf('Over') >= 0 ? total > line : total < line;
  }
  if (tip.marketType === 'btts') {
    var both = (parseInt(hScore, 10) || 0) > 0 && (parseInt(aScore, 10) || 0) > 0;
    return tip.pick === 'Yes' ? both : !both;
  }
  const homeWin = hScore > aScore, awayWin = aScore > hScore;
  if (tip.pick === 'Draw') return hScore === aScore;
  if (tip.pick.indexOf('or Draw') >= 0 && tip.pick.indexOf(home) >= 0) return hScore >= aScore;
  if (tip.pick.indexOf('or Draw') >= 0 && tip.pick.indexOf(away) >= 0) return aScore >= hScore;
  if (tip.pick.indexOf(home) >= 0 && tip.pick.indexOf('or Draw') < 0) return homeWin;
  if (tip.pick.indexOf(away) >= 0 && tip.pick.indexOf('or Draw') < 0) return awayWin;
  return false;
}

async function checkResults() {
  const now = new Date();
  const pending = trackedTips.filter(function(t) { return t.result === 'pending' && t.kickoff && new Date(t.kickoff) < new Date(now.getTime() - 2 * 60 * 60 * 1000); });
  if (pending.length === 0) return;
  loadElo(); loadForm(); loadWeights(); loadCalibration(); loadTeamStats(); loadH2H(); loadMatchDates(); loadFeatureLogs();
  for (var i = 0; i < pending.length; i++) {
    var tip = pending[i];
    try {
      var home, away; var parts = tip.match.split(' vs '); home = parts[0]; away = parts[1];
      if (tip.type === 'soccer_fifa_world_cup' || tip.type === 'soccer_epl') {
        var tipKickoff = new Date(tip.kickoff);
        var dateFrom = new Date(tipKickoff.getTime() - 86400000).toISOString().split('T')[0];
        var dateTo = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
        var res = await fetch(FB_API_BASE + '/matches?dateFrom=' + dateFrom + '&dateTo=' + dateTo, { headers: { 'X-Auth-Token': FB_API_KEY } });
        if (!res.ok) continue; var data = await res.json(); if (!data.matches) continue;
        var match = data.matches.find(function(m) { return normalizeTeamName(m.homeTeam ? m.homeTeam.name : '') === normalizeTeamName(home) && normalizeTeamName(m.awayTeam ? m.awayTeam.name : '') === normalizeTeamName(away) && m.status === 'FINISHED' && m.score && m.score.fullTime && m.score.fullTime.home !== null && m.score.fullTime.away !== null; });
        if (!match) continue;
        var hg = match.score.fullTime.home, ag = match.score.fullTime.away;
        var won = determineWin(tip, home, away, hg, ag);
        tip.result = won ? 'won' : 'lost'; tip.checkedAt = now.toISOString();
        var scoreA = hg > ag ? 1 : (hg === ag ? 0.5 : 0);
        const cfg = getCfg(tip.type);
        updateElo(tip.type, home, away, scoreA, cfg.kFactor);
        updateForm(tip.type, home, away, scoreA);
        updateWeights(tip.type, won);
        recordCalibration(tip.conf, won);
        updateTeamStats(tip.type, home, away, hg, ag);
        updateH2H(tip.type, home, away, hg, ag);
        updateMatchDate(home, tip.kickoff);
        updateMatchDate(away, tip.kickoff);
        logFeature(tip.type, tip.features, won);
        trainSportModel(tip.type); // immediate retrain
      } else {
        var res = await fetch(ODDS_API_BASE + '/sports/' + tip.type + '/scores?apiKey=' + ODDS_API_KEY + '&daysFrom=2');
        if (!res.ok) continue; var scores = await res.json(); if (!scores || scores.length === 0) continue;
        var match = scores.find(function(s) { return normalizeTeamName(s.home_team) === normalizeTeamName(home) && normalizeTeamName(s.away_team) === normalizeTeamName(away) && s.completed === true && s.scores; });
        if (!match || !match.scores) continue;
        var hScore = parseInt(match.scores[0] ? match.scores[0].score : (match.scores.home || 0), 10);
        var aScore = parseInt(match.scores[1] ? match.scores[1].score : (match.scores.away || 0), 10);
        var won = determineWin(tip, home, away, hScore, aScore);
        tip.result = won ? 'won' : 'lost'; tip.checkedAt = now.toISOString();
        const cfg = getCfg(tip.type);
        updateElo(tip.type, home, away, hScore > aScore ? 1 : (hScore === aScore ? 0.5 : 0), cfg.kFactor);
        updateForm(tip.type, home, away, hScore > aScore ? 1 : (hScore === aScore ? 0.5 : 0));
        updateWeights(tip.type, won);
        recordCalibration(tip.conf, won);
        updateTeamStats(tip.type, home, away, hScore, aScore);
        updateH2H(tip.type, home, away, hScore, aScore);
        updateMatchDate(home, tip.kickoff);
        updateMatchDate(away, tip.kickoff);
        logFeature(tip.type, tip.features, won);
        trainSportModel(tip.type); // immediate retrain
      }
    } catch (e) {}
  }
  saveTrackedTips();
  checkSportHealth();
  // Retrain models periodically
  if (Math.random() < 0.1) { // 10% chance each check
    loadFeatureLogs();
    for (var si = 0; si < SPORTS.length; si++) trainSportModel(SPORTS[si].key);
  }
}

async function refreshTips() {
  var today = new Date().toISOString().split('T')[0];
  loadTrackedTips(); loadElo(); loadForm(); loadWeights(); loadCalibration(); loadTeamStats(); loadH2H(); loadMatchDates(); loadModelCoeffs(); loadCachedOdds();
  // Fetch real team data from football-data.org (once per day)
  await fetchStandingsData();
  console.log('[REFRESH] Starting... oddsFetchDate=' + oddsFetchDate + ' today=' + today);
  if (oddsFetchDate !== today) {
    for (var si = 0; si < SPORTS.length; si++) {
      try {
        var sportKey = SPORTS[si].key;
        var url = ODDS_API_BASE + '/sports/' + sportKey + '/odds?apiKey=' + ODDS_API_KEY + '&regions=us,uk,eu&markets=h2h,spreads,totals';
        var res = await fetch(url);
        if (res.ok) {
          cachedOdds[sportKey] = await res.json();
          console.log('[ODDS] ' + sportKey + ': ' + cachedOdds[sportKey].length + ' matches');
        } else {
          var txt = await res.text();
          console.log('[ODDS] ' + sportKey + ' FAILED HTTP ' + res.status + ': ' + txt.slice(0, 200));
          cachedOdds[sportKey] = [];
        }
      } catch (e) {
        console.log('[ODDS] ' + SPORTS[si].key + ' ERROR: ' + (e.message || e).slice(0, 200));
        cachedOdds[SPORTS[si].key] = [];
      }
    }
    oddsFetchDate = today;
    // Check if any sports got data — if all empty, try cache
    var anyData = SPORTS.some(function(s) { return cachedOdds[s.key] && cachedOdds[s.key].length > 0; });
    if (!anyData) {
      console.log('[ODDS] All sports empty, loading cached odds...');
      loadCachedOdds();
      if (SPORTS.some(function(s) { return cachedOdds[s.key] && cachedOdds[s.key].length > 0; })) {
        console.log('[ODDS] Using cached odds (' + SPORTS.filter(function(s) { return cachedOdds[s.key] && cachedOdds[s.key].length > 0; }).length + ' sports)');
      }
    } else {
      saveCachedOdds();
    }
  }
  // Fetch horse racing (free, no API key needed)
  await fetchHorseRacing();
  // Fetch darts fixtures
  await fetchDartsFixtures();
  // Fetch SportMonks football fixtures
  await fetchSportMonksFixtures();
  var allTips = [];
  if (cachedRacingEvents && cachedRacingEvents.length > 0) {
    var racingTips = [];
    for (var ri = 0; ri < cachedRacingEvents.length; ri++) {
      var rt = buildHorseRacingTip(cachedRacingEvents[ri]);
      if (rt) racingTips.push(rt);
    }
    console.log('[HORSE] Generated ' + racingTips.length + ' tips from ' + cachedRacingEvents.length + ' races');
    allTips = allTips.concat(racingTips);
  }
  for (var si = 0; si < SPORTS.length; si++) {
    var sport = SPORTS[si];
    var hasOdds = cachedOdds[sport.key] && cachedOdds[sport.key].length > 0;
    if (sport.key.startsWith('soccer_')) {
      if (hasOdds) {
        for (var oi = 0; oi < cachedOdds[sport.key].length; oi++) { var tip = await buildSoccerTip(cachedOdds[sport.key][oi], sport); if (tip) allTips.push(tip); }
      } else {
        // No odds — generate from real stats + web research
        var fixtures = await fetchSoccerFixtures();
        if (fixtures.length > 0) {
          for (var fi = 0; fi < fixtures.length; fi++) {
            var m = mapFootballDataFixture(fixtures[fi]);
            var tip = await buildStatsBasedTip(m.homeTeam, m.awayTeam, m.league, m.kickoff, sport.key);
            if (tip) { tip.sport = sport.name; tip.icon = sport.icon; allTips.push(tip); }
          }
        }
      }
    } else if (hasOdds) {
      for (var oi = 0; oi < cachedOdds[sport.key].length; oi++) { var tip = buildNonSoccerTip(cachedOdds[sport.key][oi], sport); if (tip) allTips.push(tip); }
    }
    // Darts: use scraped fixtures with our own AI
    if (sport.key === 'darts_pdc' && cachedDartsFixtures.length > 0) {
      for (var di = 0; di < cachedDartsFixtures.length; di++) { var tip = buildDartsTip(cachedDartsFixtures[di]); if (tip) allTips.push(tip); }
    }
    // Non-soccer without odds: skip (no reliable data source)
  }
  // SportMonks: generate tips from SportMonks fixtures (supplements other sources)
  if (cachedSportMonksFixtures.length > 0) {
    for (var smi = 0; smi < cachedSportMonksFixtures.length; smi++) {
      var smTip = buildSportMonksTip(cachedSportMonksFixtures[smi]);
      if (smTip) allTips.push(smTip);
    }
    console.log('[SPORTMONKS] Generated tips from ' + cachedSportMonksFixtures.length + ' fixtures');
  }
  for (var ti = 0; ti < allTips.length; ti++) mergeTip(allTips[ti]);
  saveTrackedTips();
  var upcomingTips = allTips.filter(function(t) { return t.kickoff && new Date(t.kickoff).getTime() > Date.now(); });
  var sorted = upcomingTips.sort(function(a, b) { return b.conf - a.conf; });
  var groups = {};
  for (var ti = 0; ti < sorted.length; ti++) { if (!groups[sorted[ti].type]) groups[sorted[ti].type] = []; groups[sorted[ti].type].push(sorted[ti]); }
  var guaranteed = []; var remaining = [];
  for (var key in groups) { var g = groups[key]; for (var gi = 0; gi < Math.min(3, g.length); gi++) guaranteed.push(g[gi]); for (var gi = 3; gi < g.length; gi++) remaining.push(g[gi]); }
  var fillCount = Math.max(0, Math.min(50, 50 - guaranteed.length));
  cachedTips = guaranteed.concat(remaining.sort(function(a, b) { return b.conf - a.conf; }).slice(0, fillCount));
  // Send push notification for new tips
  try {
    var highConfTips = cachedTips.filter(function(t) { return t.conf >= 80; });
    if (highConfTips.length > 0) {
      var title = 'MJK Tips — ' + highConfTips.length + ' New High-Confidence Picks!';
      var body = highConfTips.slice(0, 3).map(function(t) { return t.pick + ' (' + t.conf + '%)'; }).join(', ');
      var sent = await sendPushToAll(title, body, '/');
      console.log('[PUSH] Sent to ' + sent + ' subscribers');
    }
  } catch (e) { console.log('[PUSH] Error sending notification:', e.message); }
  var staleCount = trackedTips.filter(function(t) { return t.result === 'pending' && t.kickoff && new Date(t.kickoff).getTime() < Date.now() - 3 * 86400000; }).length;
  if (staleCount > 0) {
    trackedTips = trackedTips.filter(function(t) { return !(t.result === 'pending' && t.kickoff && new Date(t.kickoff).getTime() < Date.now() - 3 * 86400000); });
    saveTrackedTips();
    console.log('[CLEANUP] Removed ' + staleCount + ' stale pending tips older than 3 days');
  }
  lastGenerated = new Date().toISOString();
  console.log('[REFRESH] Generated ' + cachedTips.length + ' tips (' + upcomingTips.length + ' upcoming, ' + allTips.length + ' total, ' + Object.keys(cachedOdds).filter(function(k) { return cachedOdds[k].length > 0; }).length + ' sports with odds)');
}

async function fetchSoccerFixtures() {
  if (!FB_API_KEY) return [];
  try { var res = await fetch(FB_API_BASE + '/matches', { headers: { 'X-Auth-Token': FB_API_KEY } }); if (!res.ok) return []; var data = await res.json(); if (!data.matches) return []; return data.matches.filter(function(m) { return m.status !== 'FINISHED' && m.status !== 'CANCELLED' && m.status !== 'POSTPONED'; }); } catch (e) { return []; }
}
function mapFootballDataFixture(match) {
  var home = match.homeTeam ? match.homeTeam.name : 'Home', away = match.awayTeam ? match.awayTeam.name : 'Away';
  var comp = match.competition ? match.competition.name : 'International';
  var stage = match.stage ? match.stage.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); }) : '';
  return { homeTeam: home, awayTeam: away, league: comp + (stage ? ' \u2014 ' + stage : ''), kickoff: match.utcDate || new Date().toISOString() };
}

// === HORSE RACING (HKJC — free, no API key) ===
var cachedRacingEvents = [];
var cachedTabSelections = {}; // Parsed TAB news race-by-race selections { 'Greyville': { 1: [{no:4,name:'Molten Rock'},...], ... } }
var tabSelectionsDate = '';
function loadRacingEvents() { cachedRacingEvents = loadJSON(RACING_EVENTS_FILE, []); }
function saveRacingEvents() { saveJSON(RACING_EVENTS_FILE, cachedRacingEvents); }

// Scrape TAB news for daily race-by-race selections (horse names + numbers)
async function fetchTabSelections() {
  var today = new Date().toISOString().slice(0, 10);
  if (tabSelectionsDate === today && Object.keys(cachedTabSelections).length > 0) return;
  try {
    // Step 1: Fetch TAB news homepage to find latest racing article
    var homeRes = await fetch(TAB_NEWS_URL, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    if (!homeRes.ok) return;
    var homeHtml = await homeRes.text();
    // Find article links that contain racing selections (look for "Race 1:" pattern hints — articles about today's racing)
    var articleUrls = [];
    var linkRegex = /href="(https?:\/\/news\.tab\.co\.za\/[^"]+\/)"/gi;
    var match;
    while ((match = linkRegex.exec(homeHtml)) !== null) {
      if (articleUrls.indexOf(match[1]) === -1) articleUrls.push(match[1]);
    }
    // Also try relative links
    var relRegex = /href="(\/[^"]+\/)"/gi;
    while ((match = relRegex.exec(homeHtml)) !== null) {
      var full = TAB_NEWS_URL + match[1];
      if (articleUrls.indexOf(full) === -1) articleUrls.push(full);
    }

    // Step 2: Try each article until we find one with race-by-race selections
    for (var ai = 0; ai < Math.min(articleUrls.length, 8); ai++) {
      try {
        var artRes = await fetch(articleUrls[ai], { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
        if (!artRes.ok) continue;
        var artHtml = await artRes.text();
        // Strip HTML tags to get plain text
        var text = artHtml.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        // Look for race-by-race selections pattern: "Race N: NN Horse Name, NN Horse Name"
        var racePattern = /Race\s+(\d{1,2})\s*:\s*((?:\d{1,2}\s+[A-Z][a-zA-Z\s'.-]+?)(?:,\s*\d{1,2}\s+[A-Z][a-zA-Z\s'.-]+?)*)/gi;
        var selections = {};
        var venue = '';
        // Try to extract venue from article title or content
        var venueMatch = text.match(/(?:at|Racecourse?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i) || artHtml.match(/<title[^>]*>([^<]+)/i);
        if (venueMatch) venue = venueMatch[1] || '';
        // Normalize common venue names
        var venueLower = venue.toLowerCase();
        if (venueLower.indexOf('greyville') >= 0 || venueLower.indexOf('grey') >= 0) venue = 'Greyville';
        else if (venueLower.indexOf('turffontein') >= 0 || venueLower.indexOf('turf') >= 0) venue = 'Turffontein';
        else if (venueLower.indexOf('kenilworth') >= 0) venue = 'Kenilworth';
        else if (venueLower.indexOf('fairview') >= 0) venue = 'Fairview';
        else if (venueLower.indexOf('vaal') >= 0) venue = 'Vaal';
        else if (venueLower.indexOf('scottsville') >= 0) venue = 'Scottsville';

        var raceMatch;
        while ((raceMatch = racePattern.exec(text)) !== null) {
          var raceNo = parseInt(raceMatch[1]);
          var picks = raceMatch[2].split(',').map(function(p) {
            p = p.trim();
            var numMatch = p.match(/^(\d{1,2})\s+(.+)/);
            if (numMatch) return { no: parseInt(numMatch[1]), name: numMatch[2].trim() };
            return null;
          }).filter(Boolean);
          if (picks.length > 0) selections[raceNo] = picks;
        }
        // Also extract BEST BET and VALUE BET
        var bestBetMatch = text.match(/BEST\s+BET\s*(?:\([^)]*\))?\s*[:\s]*Race\s+(\d{1,2})\s*:\s*(\d{1,2})\s+([A-Z][a-zA-Z\s'.-]+)/i);
        var valueBetMatch = text.match(/VALUE\s+BET\s*(?:\([^)]*\))?\s*[:\s]*Race\s+(\d{1,2})\s*:\s*(\d{1,2})\s+([A-Z][a-zA-Z\s'.-]+)/i);
        if (bestBetMatch && selections[parseInt(bestBetMatch[1])]) {
          var bbRace = parseInt(bestBetMatch[1]);
          var bbNo = parseInt(bestBetMatch[2]);
          var bbName = bestBetMatch[3].trim();
          if (!selections[bbRace].find(function(s) { return s.no === bbNo; })) {
            selections[bbRace].unshift({ no: bbNo, name: bbName });
          }
          selections._bestBet = { race: bbRace, no: bbNo, name: bbName };
        }
        if (valueBetMatch && selections[parseInt(valueBetMatch[1])]) {
          var vbRace = parseInt(valueBetMatch[1]);
          var vbNo = parseInt(valueBetMatch[2]);
          var vbName = valueBetMatch[3].trim();
          selections._valueBet = { race: vbRace, no: vbNo, name: vbName };
        }

        if (Object.keys(selections).length > 0) {
          cachedTabSelections[venue || 'Unknown'] = selections;
          console.log('[TAB] Parsed selections for ' + (venue || 'Unknown') + ': ' + Object.keys(selections).filter(function(k) { return k !== '_bestBet' && k !== '_valueBet'; }).length + ' races');
        }
      } catch (e) { /* skip failed article */ }
    }
    if (Object.keys(cachedTabSelections).length > 0) {
      tabSelectionsDate = today;
      console.log('[TAB] Total venues with selections: ' + Object.keys(cachedTabSelections).length);
    }
  } catch (e) { console.log('[TAB] Error: ' + (e.message || e)); }
}

async function fetchHorseRacing() {
  // First, scrape TAB news for daily expert selections (horse names)
  await fetchTabSelections();

  // Source 1: racingandsports.com.au free JSON (no auth required)
  try {
    var res = await fetch(RACING_JSON_URL, {
      timeout: 10000,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    if (res.ok) {
      var data = await res.json();
      var races = [];
      // Priority countries for SA user
      var priorityCountries = ['SAF', 'AUS', 'GB', 'IRE'];
      for (var di = 0; di < data.length; di++) {
        var discipline = data[di];
        if (discipline.Discipline !== 'T') continue; // Thoroughbred only
        for (var ci = 0; ci < discipline.Countries.length; ci++) {
          var country = discipline.Countries[ci];
          for (var mi = 0; mi < country.Meetings.length; mi++) {
            var meeting = country.Meetings[mi];
            if (meeting.HasResults || meeting.MeetingClosed) continue;
            var remainingMin = meeting.Remaining || 0;
            if (remainingMin < 0 || remainingMin > 240) continue; // Skip past races or >4hr away
            var kickoffTime = new Date(Date.now() + remainingMin * 60000).toISOString();
            var priority = priorityCountries.indexOf(country.countryCode) >= 0;
            races.push({
              id: 'ras-' + country.countryCode + '-' + meeting.Course.replace(/\s+/g, '-').toLowerCase() + '-R' + meeting.RaceNumber,
              track: meeting.Course,
              name: meeting.Course + ' R' + meeting.RaceNumber,
              country: country.CountryName,
              countryCode: country.countryCode,
              raceNumber: meeting.RaceNumber,
              time: kickoffTime,
              kickoff: kickoffTime,
              remaining: remainingMin,
              runners: [],
              priority: priority,
              formUrl: meeting.FormGuideUrl || '',
              resultUrl: meeting.PostMeetingUrl || ''
            });
          }
        }
      }
      // Sort: priority countries first, then by time
      races.sort(function(a, b) {
        if (a.priority !== b.priority) return b.priority ? 1 : -1;
        return new Date(a.time).getTime() - new Date(b.time).getTime();
      });
      // Take top 15 races
      races = races.slice(0, 15);
      // Merge TAB selections into runners for SA races
      if (Object.keys(cachedTabSelections).length > 0) {
        for (var ri = 0; ri < races.length; ri++) {
          var race = races[ri];
          if (race.countryCode !== 'SAF') continue;
          var trackKey = race.track;
          // Try exact match, then partial match
          var tabVenue = cachedTabSelections[trackKey];
          if (!tabVenue) {
            var trackLower = trackKey.toLowerCase();
            var keys = Object.keys(cachedTabSelections);
            for (var ki = 0; ki < keys.length; ki++) {
              if (keys[ki].toLowerCase().indexOf(trackLower) >= 0 || trackLower.indexOf(keys[ki].toLowerCase()) >= 0) {
                tabVenue = cachedTabSelections[keys[ki]];
                break;
              }
            }
          }
          if (tabVenue && tabVenue[race.raceNumber]) {
            race.runners = tabVenue[race.raceNumber].map(function(s) {
              return { name: s.name, horseNo: s.no, odds: 0, book: 'TAB Expert' };
            });
            // Mark best/value bet
            if (tabVenue._bestBet && tabVenue._bestBet.race === race.raceNumber) {
              race.bestBet = tabVenue._bestBet;
            }
            if (tabVenue._valueBet && tabVenue._valueBet.race === race.raceNumber) {
              race.valueBet = tabVenue._valueBet;
            }
          }
        }
      }
      if (races.length > 0) {
        cachedRacingEvents = races;
        saveRacingEvents();
        var saWithRunners = races.filter(function(r) { return r.countryCode === 'SAF' && r.runners.length > 0; }).length;
        console.log('[HORSE] Fetched ' + races.length + ' races from racingandsports.com.au (' + races.filter(function(r) { return r.countryCode === 'SAF'; }).length + ' SA, ' + saWithRunners + ' with TAB selections)');
        return;
      }
    }
  } catch (e) { console.log('[HORSE] RacingAndSports error: ' + (e.message || e)); }

  // Source 2: Try odds-api.net (if key is configured)
  if (HORSE_RACING_API_KEY) {
    try {
      var res2 = await fetch('https://api.odds-api.net/v1/racing/events?date=' + new Date().toISOString().slice(0, 10), {
        headers: { 'X-API-Key': HORSE_RACING_API_KEY },
        timeout: 10000
      });
      if (res2.ok) {
        var events2 = await res2.json();
        if (Array.isArray(events2) && events2.length > 0) {
          cachedRacingEvents = events2.map(function(e) {
            return {
              id: e.id || '',
              track: e.venue || e.title || 'Horse Racing',
              name: e.title || 'Race',
              time: e.commence_time || '',
              kickoff: e.commence_time || '',
              runners: (e.runners || []).map(function(r) { return { name: r.name, odds: r.odds || 0, book: '' }; })
            };
          }).filter(function(r) { return r.runners.length >= 2; });
          saveRacingEvents();
          console.log('[HORSE] Fetched ' + cachedRacingEvents.length + ' races from odds-api.net');
          return;
        }
      }
    } catch (e) { console.log('[HORSE] odds-api.net error: ' + (e.message || e)); }
  }

  console.log('[HORSE] No racing data available');
  loadRacingEvents();
}

function buildHorseRacingTip(event) {
  var track = event.track || '';
  var name = event.name || 'Race';
  var dist = event.distance ? ' (' + event.distance + 'm)' : '';
  var time = event.time || event.kickoff || '';
  var country = event.country || '';
  var raceNum = event.raceNumber || '';
  var formUrl = event.formUrl || '';
  var runners = event.runners || [];
  var bestBet = event.bestBet || null;
  var valueBet = event.valueBet || null;

  if (!time || new Date(time).getTime() < Date.now()) return null;

  var isSA = event.countryCode === 'SAF';
  var kickoffDate = new Date(time);
  var timeStr = kickoffDate.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
  var countryFlag = isSA ? '\uD83C\uDDFF\uD83C\uDDE6' : (event.countryCode === 'AUS' ? '\uD83C\uDDE6\uD83C\uDDFA' : '\uD83C\uDDEC\uD83C\uDDE7');

  // If we have runners with odds, use the odds-based approach
  if (runners.length >= 2 && runners.some(function(r) { return parseFloat(r.odds) > 1; })) {
    var cfg = getCfg('horse_racing');
    var pick = null, bestProb = 0, bestOdds = 0, bestBook = '';
    for (var i = 0; i < runners.length; i++) {
      var r = runners[i];
      var odds = parseFloat(r.odds) || 0;
      if (odds <= 1) continue;
      var prob = 1 / odds;
      if (prob > bestProb) {
        bestProb = prob;
        bestOdds = odds;
        pick = r.name || 'Runner ' + (i + 1);
        bestBook = r.book || '';
      }
    }
    if (pick && bestOdds > 0) {
      var conf = Math.min(cfg.maxConf, Math.max(cfg.minConf, Math.round(bestProb * 100)));
      if (conf >= cfg.minConf) {
        return {
          type: 'horse_racing', sport: 'Horse Racing', icon: '\uD83C\uDFC7',
          match: countryFlag + ' ' + (track ? track + ' — ' : '') + 'Race ' + raceNum + dist,
          league: track || 'Horse Racing', country: country || 'International',
          marketType: 'h2h', market: 'Race Winner', marketLine: null,
          kickoff: time, pick: pick + ' to Win', odds: bestOdds.toFixed(2),
          conf: conf, realOdds: null, bookmaker: bestBook, valueBet: false,
          reason: 'AI Horse Racing — Form analysis (' + runners.length + ' runners, favourite)',
          features: [0, 0, 0, 0, 0, 0, 0, 1]
        };
      }
    }
  }

  // If we have TAB expert selections (horse names but no odds), use expert picks
  if (runners.length >= 2 && runners[0].name) {
    var cfg2 = getCfg('horse_racing');
    // The first runner in the list is the expert's top pick
    var topPick = runners[0];
    var pickName = (topPick.horseNo ? '#' + topPick.horseNo + ' ' : '') + topPick.name;
    // Count all runners listed
    var runnerCount = runners.length;
    // Build reason with all listed runners
    var runnerList = runners.map(function(r) {
      return (r.horseNo ? r.horseNo + ' ' : '') + r.name;
    }).join(', ');
    // Higher confidence for SA races with expert picks
    var conf = isSA ? 78 : 70;
    // Bonus if this is a best bet
    if (bestBet) {
      pickName = '\u2B50 ' + (bestBet.no ? '#' + bestBet.no + ' ' : '') + bestBet.name + ' (BEST BET)';
      conf = Math.min(cfg2.maxConf, conf + 5);
    }
    var reasonText = 'TAB Expert Picks (' + runnerCount + ' runners) \u2014 ' + runnerList;
    if (valueBet) {
      reasonText += ' | Value: #' + valueBet.no + ' ' + valueBet.name;
    }

    return {
      type: 'horse_racing', sport: 'Horse Racing', icon: '\uD83C\uDFC7',
      match: countryFlag + ' ' + (track ? track + ' — ' : '') + 'Race ' + raceNum + dist,
      league: track || 'Horse Racing', country: country || 'International',
      marketType: 'h2h', market: 'Race Winner', marketLine: null,
      kickoff: time, pick: pickName, odds: 'Expert Pick',
      conf: conf, realOdds: null, bookmaker: 'TAB', valueBet: !!valueBet,
      reason: reasonText,
      features: [0, 0, 0, 0, 0, 0, 0, 1]
    };
  }

  // Fallback: Race card without any runner data
  var conf3 = isSA ? 72 : 65;
  var raceLabel = track + (raceNum ? ' — Race ' + raceNum : '');

  return {
    type: 'horse_racing', sport: 'Horse Racing', icon: '\uD83C\uDFC7',
    match: countryFlag + ' ' + raceLabel,
    league: track || 'Horse Racing', country: country || 'International',
    marketType: 'h2h', market: 'Race Winner', marketLine: null,
    kickoff: time, pick: 'Runners to be confirmed', odds: 'TBD',
    conf: conf3, realOdds: null, bookmaker: '', valueBet: false,
    reason: 'Horse racing card — ' + country + ' — ' + timeStr + (formUrl ? ' | ' + formUrl : ''),
    features: [0, 0, 0, 0, 0, 0, 0, 1]
  };
}

// === DARTS (SportDevs free API: 300 req/day) ===
var cachedDartsFixtures = [];
var dartsFetchDate = '';
const DARTS_FIXTURES_FILE = path.join(DATA_DIR, 'darts_fixtures.json');

function loadDartsFixtures() { cachedDartsFixtures = loadJSON(DARTS_FIXTURES_FILE, []); }
function saveDartsFixtures() { saveJSON(DARTS_FIXTURES_FILE, cachedDartsFixtures); }

async function fetchDartsFixtures() {
  var today = new Date().toISOString().slice(0, 10);
  if (dartsFetchDate === today && cachedDartsFixtures.length > 0) return;
  loadDartsFixtures();
  if (dartsFetchDate === today && cachedDartsFixtures.length > 0) return;

  // Strategy 1: The Odds API — check if darts is in season
  try {
    if (ODDS_API_KEY) {
      var url = ODDS_API_BASE + '/sports/upcoming?apiKey=' + ODDS_API_KEY;
      var res = await fetch(url, { timeout: 8000 });
      if (res.ok) {
        var upcoming = await res.json();
        var dartsEvents = upcoming.filter(function(e) { return e.sport_key && e.sport_key.indexOf('darts') >= 0; });
        if (dartsEvents.length > 0) {
          cachedDartsFixtures = dartsEvents.map(function(e) {
            var bestOdds = null;
            if (e.bookmakers && e.bookmakers.length > 0) {
              for (var bi = 0; bi < e.bookmakers.length; bi++) {
                var h2h = e.bookmakers[bi].markets && e.bookmakers[bi].markets.find(function(m) { return m.key === 'h2h'; });
                if (h2h && h2h.outcomes && h2h.outcomes.length >= 2) {
                  bestOdds = { home: h2h.outcomes[0].price, away: h2h.outcomes[1].price, book: e.bookmakers[bi].title };
                  break;
                }
              }
            }
            return {
              id: e.id,
              home: e.home_team || 'Player 1',
              away: e.away_team || 'Player 2',
              league: e.sport_title || 'Darts',
              kickoff: e.commence_time || '',
              odds: bestOdds
            };
          });
          dartsFetchDate = today;
          saveDartsFixtures();
          console.log('[DARTS] Odds API: ' + cachedDartsFixtures.length + ' upcoming events');
          return;
        }
      }
    }
  } catch (e) { console.log('[DARTS] Odds API error: ' + (e.message || e).slice(0, 150)); }

  // Strategy 2: Scrape darts fixtures from public sources
  var scrapeSources = [
    { url: 'https://www.dartsrankings.com/api/matches', parse: function(d) { return Array.isArray(d) ? d : []; } },
    { url: 'https://api.sofascore.com/api/v1/sport/darts/events/next/0', parse: function(d) { return (d && d.events) ? d.events : []; } }
  ];
  for (var si = 0; si < scrapeSources.length; si++) {
    try {
      var src = scrapeSources[si];
      var scrapeRes = await fetch(src.url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 MJKTips/1.0', 'Accept': 'application/json' } });
      if (scrapeRes.ok) {
        var scrapeData = await scrapeRes.json();
        var matches = src.parse(scrapeData);
        if (matches.length > 0) {
          cachedDartsFixtures = matches.slice(0, 30).map(function(m) {
            var home = m.home_team || m.homeTeam?.name || m.participants?.[0]?.name || m.player1 || m.home || 'TBD';
            var away = m.away_team || m.awayTeam?.name || m.participants?.[1]?.name || m.player2 || m.away || 'TBD';
            var kickoff = m.start_time || m.date || m.kickoff || m.startTimestamp || '';
            if (kickoff && typeof kickoff === 'number') kickoff = new Date(kickoff * 1000).toISOString();
            return { id: m.id || '', home: home, away: away, league: m.tournament?.name || m.event || m.league || 'PDC Darts', kickoff: kickoff, odds: null };
          }).filter(function(m) { return m.home !== 'TBD' && m.away !== 'TBD'; });
          if (cachedDartsFixtures.length > 0) {
            dartsFetchDate = today;
            saveDartsFixtures();
            console.log('[DARTS] Scraped: ' + cachedDartsFixtures.length + ' fixtures from source ' + (si + 1));
            return;
          }
        }
      }
    } catch (e) {}
  }

  // Strategy 3: Use cached data if fresh enough (< 2 days old)
  if (cachedDartsFixtures.length > 0) {
    console.log('[DARTS] Using cached fixtures (' + cachedDartsFixtures.length + ' fixtures)');
    dartsFetchDate = today;
    return;
  }

  dartsFetchDate = today;
  console.log('[DARTS] No data sources available');
}

function buildDartsTip(fixture) {
  var sportKey = 'darts_pdc';
  if (disabledSports[sportKey]) return null;
  var cfg = getCfg(sportKey);
  var home = fixture.home, away = fixture.away;
  var kickoff = fixture.kickoff || '';
  if (!kickoff || new Date(kickoff).getTime() < Date.now()) return null;

  var hElo = getElo(sportKey, home);
  var aElo = getElo(sportKey, away);
  var hFm = formModifier(sportKey, home);
  var aFm = formModifier(sportKey, away);
  var adjH = Math.max(1000, Math.min(2000, hElo + hFm));
  var adjA = Math.max(1000, Math.min(2000, aElo + aFm));
  var prob = expectedScore(adjH, adjA);

  // If we have odds from scrape, use market consensus
  if (fixture.odds && typeof fixture.odds === 'object') {
    var oH = parseFloat(fixture.odds.home) || 0;
    var oA = parseFloat(fixture.odds.away) || 0;
    if (oH > 1 && oA > 1) {
      var mH = 1 / oH, mA = 1 / oA;
      prob = prob * 0.5 + mH * 0.5;
    }
  }

  var pick = prob > 0.5 ? home : away;
  var pickProb = Math.max(prob, 1 - prob);
  var odds = prob > 0.5 ? (1 / prob).toFixed(2) : (1 / (1 - prob)).toFixed(2);

  var features = buildFeatures(home, away, sportKey);
  var rawLR = predictLR(sportKey, features);
  if (rawLR !== null) {
    pickProb = pickProb * 0.6 + Math.max(rawLR, 1 - rawLR) * 0.4;
    pick = rawLR > 0.5 ? home : away;
    odds = (1 / pickProb).toFixed(2);
  }

  var confidence = confidenceFromProb(pickProb, 0.6);
  var formNote = (Math.abs(hFm) > 5 || Math.abs(aFm) > 5) ? ' Form ' + (hFm > 0 ? '+' : '') + hFm + 'v' + (aFm > 0 ? '+' : '') + aFm : '';
  var reason = 'AI Darts' + (rawLR !== null ? ' ML' : '') + ' Elo ' + Math.round(adjH) + 'v' + Math.round(adjA) + formNote;

  return {
    type: sportKey, sport: 'PDC Darts', icon: '\uD83C\uDFAF',
    match: home + ' vs ' + away, league: fixture.league || 'PDC Darts',
    country: 'International', marketType: 'h2h', market: 'Match Winner', marketLine: null,
    kickoff: kickoff, pick: pick + ' to Win', odds: odds,
    conf: Math.min(cfg.maxConf, Math.max(cfg.minConf, confidence)),
    realOdds: null, bookmaker: '', valueBet: false,
    reason: reason, features: features
  };
}

// === SPORTMONKS API (Football data + live scores) ===
var cachedSportMonksFixtures = [];
var sportMonksFetchDate = '';
const SPORTMONKS_FIXTURES_FILE = path.join(DATA_DIR, 'sportmonks_fixtures.json');
const SPORTMONKS_LEAGUE_MAP = {
  8: 'soccer_epl',       // Premier League
  5: 'soccer_epl',       // La Liga
  82: 'soccer_epl',      // Bundesliga
  28: 'soccer_epl',      // Ligue 1
  55: 'soccer_epl',      // Serie A
  7: 'soccer_epl',       // Champions League
  693: 'soccer_epl',     // Europa League
  242: 'soccer_fifa_world_cup', // World Cup Qualifiers
  1: 'soccer_fifa_world_cup'    // International
};

function loadSportMonksFixtures() { cachedSportMonksFixtures = loadJSON(SPORTMONKS_FIXTURES_FILE, []); }
function saveSportMonksFixtures() { saveJSON(SPORTMONKS_FIXTURES_FILE, cachedSportMonksFixtures); }

async function fetchSportMonksFixtures() {
  var today = new Date().toISOString().slice(0, 10);
  if (sportMonksFetchDate === today && cachedSportMonksFixtures.length > 0) return;
  if (!SPORTMONKS_API_KEY) return;
  loadSportMonksFixtures();
  if (sportMonksFetchDate === today && cachedSportMonksFixtures.length > 0) return;

  try {
    // Fetch today's fixtures with participating teams and scores
    var now = Math.floor(Date.now() / 1000);
    var todayStart = new Date(today + 'T00:00:00Z').getTime() / 1000;
    var todayEnd = todayStart + 86400;
    var url = SPORTMONKS_API_BASE + '/fixtures?api_token=' + SPORTMONKS_API_KEY +
      '&include=participants;league;scores;periods' +
      '&filter=starting_at_timestamp:' + todayStart + ',' + todayEnd;
    var res = await fetch(url, { timeout: 15000 });
    if (!res.ok) {
      console.log('[SPORTMONKS] HTTP ' + res.status);
      // Fallback: try without filter
      var fallbackUrl = SPORTMONKS_API_BASE + '/fixtures?api_token=' + SPORTMONKS_API_KEY +
        '&include=participants;league;scores&take=20&sort=starting_at';
      res = await fetch(fallbackUrl, { timeout: 15000 });
      if (!res.ok) { console.log('[SPORTMONKS] Fallback also failed: ' + res.status); return; }
    }
    var data = await res.json();
    if (!data.data || !Array.isArray(data.data)) { console.log('[SPORTMONKS] No fixture data'); return; }

    var fixtures = [];
    for (var fi = 0; fi < data.data.length; fi++) {
      var fx = data.data[fi];
      if (!fx.participants || fx.participants.length < 2) continue;
      var homeP = fx.participants.find(function(p) { return p.meta && p.meta.location === 'home'; }) || fx.participants[0];
      var awayP = fx.participants.find(function(p) { return p.meta && p.meta.location === 'away'; }) || fx.participants[1];
      if (!homeP || !awayP) continue;
      var leagueId = fx.league_id || 0;
      var leagueName = fx.league ? fx.league.name : 'Football';
      var sportKey = SPORTMONKS_LEAGUE_MAP[leagueId] || 'soccer_epl';
      var homeScore = 0, awayScore = 0, status = 'NS';
      if (fx.scores && fx.scores.length > 0) {
        for (var si = 0; si < fx.scores.length; si++) {
          var sc = fx.scores[si];
          if (sc.description === 'FULL_TIME' || sc.description === '2ND_HALF') {
            homeScore = sc.home || 0;
            awayScore = sc.away || 0;
            break;
          }
        }
      }
      if (fx.state_id === 5) status = 'FT';
      else if (fx.state_id === 1) status = 'LIVE';
      else if (fx.state_id === 2) status = 'HT';

      fixtures.push({
        id: 'sm-' + fx.id,
        home: homeP.name || 'Home',
        away: awayP.name || 'Away',
        league: leagueName,
        leagueId: leagueId,
        sportKey: sportKey,
        kickoff: fx.starting_at || '',
        homeScore: homeScore,
        awayScore: awayScore,
        status: status,
        isLive: fx.state_id === 1 || fx.state_id === 2
      });
    }

    cachedSportMonksFixtures = fixtures;
    sportMonksFetchDate = today;
    saveSportMonksFixtures();
    console.log('[SPORTMONKS] Fetched ' + fixtures.length + ' fixtures (' + fixtures.filter(function(f) { return f.isLive; }).length + ' live)');
  } catch (e) {
    console.log('[SPORTMONKS] Error: ' + (e.message || e).slice(0, 200));
    sportMonksFetchDate = today;
  }
}

function buildSportMonksTip(fixture) {
  if (fixture.status === 'FT') return null;
  var sportKey = fixture.sportKey || 'soccer_epl';
  var cfg = getCfg(sportKey);
  var home = fixture.home, away = fixture.away;
  if (!home || !away) return null;

  var hStats = getAttackDefense(sportKey, home, true);
  var aStats = getAttackDefense(sportKey, away, false);
  var poisson = dcPoissonPrediction(hStats.attack, hStats.defense, aStats.attack, aStats.defense, sportKey);
  var fmHome = formModifier(sportKey, home);
  var fmAway = formModifier(sportKey, away);
  var adjH = Math.max(1000, Math.min(2000, getElo(sportKey, home) + HOME_ADVANTAGE_ELO + fmHome));
  var adjA = Math.max(1000, Math.min(2000, getElo(sportKey, away) + fmAway));
  var eloHome = expectedScore(adjH, adjA);
  var eloDraw = cfg.hasDraw ? 0.25 : 0;
  var eloHW = eloHome * (1 - eloDraw);
  var eloAW = (1 - eloHome) * (1 - eloDraw);
  var w = getWeights(sportKey);

  var predHW = poisson.homeWin * w.poissonWeight + eloHW * w.eloWeight;
  var predAW = poisson.awayWin * w.poissonWeight + eloAW * w.eloWeight;
  var predD = cfg.hasDraw ? (poisson.draw * w.poissonWeight + eloDraw * w.eloWeight) : 0;
  var total = predHW + predAW + predD;
  if (total > 0) { predHW /= total; predAW /= total; predD /= total; }

  var features = buildFeatures(home, away, sportKey);
  var rawLR = predictLR(sportKey, features);
  if (rawLR !== null) {
    var mlH = rawLR, mlA = 1 - rawLR;
    predHW = predHW * 0.65 + mlH * 0.35;
    predAW = predAW * 0.65 + mlA * 0.35;
    total = predHW + predAW + predD;
    if (total > 0) { predHW /= total; predAW /= total; predD /= total; }
  }

  var pick = '', conf = 0, odds = '0', mr = 'Match Result';
  if (predHW > predAW && predHW > predD && predHW > 0.35) {
    pick = home + ' to Win'; conf = Math.round(predHW * 100);
    odds = predHW > 0.05 ? (1 / predHW * 0.92).toFixed(2) : '1.50';
  } else if (predAW > predHW && predAW > predD && predAW > 0.35) {
    pick = away + ' to Win'; conf = Math.round(predAW * 100);
    odds = predAW > 0.05 ? (1 / predAW * 0.92).toFixed(2) : '1.50';
  } else if (cfg.hasDraw && predD > 0.25) {
    return null;
  } else {
    return null;
  }
  conf = Math.min(cfg.maxConf, Math.max(cfg.minConf, calibrateConfidence(conf)));

  var rc = [];
  if (hStats.source === 'standings') rc.push('REAL');
  rc.push('SM');
  if (rawLR !== null) rc.push('ML');
  rc.push('Pois+' + poisson.expectedHomeGoals.toFixed(1) + '-' + poisson.expectedAwayGoals.toFixed(1));
  rc.push('Elo ' + Math.round(adjH) + 'v' + Math.round(adjA));

  return {
    type: sportKey, sport: 'Football', icon: '\u26BD',
    match: home + ' vs ' + away, league: fixture.league || 'Football',
    country: COUNTRY_MAP[sportKey] || '',
    marketType: 'h2h', market: mr, marketLine: null,
    kickoff: fixture.kickoff, pick: pick, odds: odds, conf: conf,
    realOdds: null, bookmaker: '', valueBet: false,
    reason: 'AI [' + mr + '] ' + rc.join(' | '), features: features
  };
}

// === TELEGRAM BOT (Long Polling) ===
var tgOffset = 0;
var tgPolling = false;

async function sendTelegram(chatId, message, extra) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    var body = { chat_id: chatId, text: message, parse_mode: 'HTML', disable_web_page_preview: true };
    if (extra) Object.assign(body, extra);
    await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {}
}

async function deleteTelegramMessage(chatId, messageId) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/deleteMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
  } catch (e) {}
}

function loadTgWarnings() { return loadJSON(TG_WARNINGS_FILE, {}); }
function saveTgWarnings(w) { saveJSON(TG_WARNINGS_FILE, w); }

function detectLanguage(text) {
  var latinChars = text.replace(/[^a-zA-Z]/g, '').length;
  var totalChars = text.replace(/\s/g, '').length;
  if (totalChars === 0) return 'en';
  return (latinChars / totalChars) > 0.85 ? 'en' : 'other';
}

async function translateToEnglish(text) {
  try {
    var encoded = encodeURIComponent(text);
    var r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=' + encoded, { timeout: 5000 });
    var d = await r.json();
    if (d && d[0]) {
      return d[0].map(function(s) { return s[0]; }).join('');
    }
  } catch (e) {}
  return text;
}

function isGroupAdmin(msg) {
  return msg && msg.from && (
    msg.from.is_bot === false &&
    msg.chat && msg.chat.all_administrators &&
    msg.chat.all_administrators.some(function(a) { return a.user.id === msg.from.id; })
  ) || (msg && msg.from && msg.from.id === msg.chat.owner);
}

function isLink(text) {
  return /https?:\/\/|www\.|t\.me|bit\.ly|tinyurl\.com|wa\.me|chat\.whatsapp\.com|discord\.gg|telegram\.me/i.test(text);
}

function isSpam(text) {
  var lower = text.toLowerCase();
  return /buy now|free money|click here|join now|dm me|whatsapp.*group|bet.*guaranteed|100%.*win|double your|cash out/i.test(lower);
}

function formatTip(t, idx) {
  var kickoff = t.kickoff ? new Date(t.kickoff).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : 'TBD';
  return (idx !== undefined ? idx + '. ' : '') +
    t.icon + ' <b>' + t.match + '</b>\n' +
    '   ' + t.pick + ' @ <b>' + t.odds + '</b> (' + t.conf + '%)\n' +
    '   ' + t.market + ' | ' + kickoff + (t.valueBet ? ' | VALUE' : '');
}

function upcomingTips(tips, limit) {
  var now = Date.now();
  return tips.filter(function(t) { return t.kickoff && new Date(t.kickoff).getTime() > now; }).slice(0, limit || 10);
}

async function handleTelegramUpdate(update) {
  if (!TELEGRAM_BOT_TOKEN) return;

  // Handle new chat members (welcome)
  if (update.message && update.message.new_chat_members) {
    var chatId = update.message.chat.id;
    if (chatId < 0) {
      var members = update.message.new_chat_members;
      for (var m = 0; m < members.length; m++) {
        var user = members[m];
        if (user.is_bot) continue;
        var name = user.first_name || user.username || 'there';
        await sendTelegram(chatId,
          '👋 Welcome <b>' + name + '</b> to MJK Betting Tips!\n\n' +
          '🏆 South Africa\'s most trusted betting community\n\n' +
          'Get started:\n' +
          '• /tips — Today\'s free tips\n' +
          '• /bankers — Highest confidence picks\n' +
          '• /help — All commands\n\n' +
          '📊 We use AI-powered analysis across soccer, tennis, cricket, horse racing & more.\n\n' +
          '🔗 <b>Upgrade for full access:</b>\n' +
          'Visit mjkbettingtips.com for Pro & Elite plans!'
        );
      }
    }
    return;
  }

  // Handle left chat member (goodbye)
  if (update.message && update.message.left_chat_member) {
    var leftUser = update.message.left_chat_member;
    if (!leftUser.is_bot && update.message.chat.id < 0) {
      console.log('[TELEGRAM] User left: ' + (leftUser.first_name || leftUser.username || leftUser.id));
    }
    return;
  }

  var msg = update.message;
  if (!msg || !msg.text) return;
  var chatId = msg.chat.id;
  var text = msg.text.trim();
  var textLower = text.toLowerCase();
  var subs = loadTelegramSubs();
  var isSub = subs.some(function(s) { return s.chatId === chatId; });
  var isGroup = chatId < 0;

  // Auto-detect group chat ID
  if (isGroup && TELEGRAM_GROUP_ID === '' && msg.chat && msg.chat.title) {
    process.env.TELEGRAM_GROUP_ID = String(chatId);
    console.log('[TELEGRAM] Auto-detected group: "' + msg.chat.title + '" ID: ' + chatId + ' — add TELEGRAM_GROUP_ID=' + chatId + ' to .env');
  }

  // === GROUP MODE: Enforce rules ===
  if (isGroup) {
    var userId = msg.from.id;
    var isAdmin = msg.from.username === 'admin' || msg.from.username === 'mjkbettingtips';

    // Skip enforcement for admins
    if (!isAdmin) {

      // 1. BLOCK LINKS
      if (isLink(text)) {
        await deleteTelegramMessage(chatId, msg.message_id);
        var warnings = loadTgWarnings();
        var key = String(chatId) + ':' + String(userId);
        if (!warnings[key]) warnings[key] = { count: 0, firstName: msg.from.first_name || '', history: [] };
        warnings[key].count++;
        warnings[key].history.push({ reason: 'link', time: new Date().toISOString(), text: text.slice(0, 100) });
        // Keep only last 10 history entries
        if (warnings[key].history.length > 10) warnings[key].history = warnings[key].history.slice(-10);
        saveTgWarnings(warnings);
        var warnCount = warnings[key].count;
        var uname = msg.from.first_name || 'User';
        if (warnCount >= 3) {
          await sendTelegram(chatId,
            '🚫 <b>' + uname + '</b> has been warned ' + warnCount + ' times for posting links.\n\n' +
            '⚠️ Further violations may result in a mute.\n\n' +
            '📢 <i>Links are not allowed in this group to keep it safe for everyone.</i>'
          );
        } else {
          await sendTelegram(chatId,
            '⚠️ <b>' + uname + '</b>, links are not allowed here!\n' +
            'Warning ' + warnCount + '/3. ' + (3 - warnCount) + ' more and you\'ll be flagged.'
          );
        }
        console.log('[TELEGRAM] Deleted link from ' + uname + ' (warn ' + warnCount + '/3)');
        return;
      }

      // 2. BLOCK SPAM
      if (isSpam(text)) {
        await deleteTelegramMessage(chatId, msg.message_id);
        await sendTelegram(chatId, '🚫 Spam message removed. Please keep the chat clean.');
        console.log('[TELEGRAM] Deleted spam from ' + (msg.from.first_name || 'unknown'));
        return;
      }

      // 3. TRANSLATE NON-ENGLISH MESSAGES
      if (text.length > 5 && detectLanguage(text) !== 'en') {
        var translated = await translateToEnglish(text);
        if (translated && translated !== text) {
          await sendTelegram(chatId,
            '🌐 <b>' + (msg.from.first_name || 'User') + '</b> (translated from another language):\n\n' +
            '<i>"' + translated + '"</i>',
            { reply_to_message_id: msg.message_id }
          );
          console.log('[TELEGRAM] Translated message from ' + (msg.from.first_name || 'unknown'));
        }
      }
    }
  }

  // === COMMAND HANDLING ===

  // /start
  if (textLower === '/start' || textLower === '/start@mjk_bettingtips_bot') {
    if (!isSub) { subs.push({ chatId: chatId, username: msg.from.username || '', firstName: msg.from.first_name || '', subscribedAt: new Date().toISOString() }); saveTelegramSubs(subs); }
    await sendTelegram(chatId,
      'Welcome to MJK Betting Tips!\n\n' +
      'Commands:\n' +
      '/tips — Today\'s top tips\n' +
      '/bankers — Highest confidence picks\n' +
      '/all — All upcoming tips\n' +
      '/sport <name> — Filter by sport (e.g. /sport soccer)\n' +
      '/stats — Win rate & performance\n' +
      '/results — Recent won/lost tips\n' +
      '/help — Show this menu\n\n' +
      'You can also just type tips, bankers, or a sport name!'
    );
    return;
  }

  // /stop
  if (textLower === '/stop' || textLower === '/stop@mjk_bettingtips_bot') {
    saveTelegramSubs(subs.filter(function(s) { return s.chatId !== chatId; }));
    await sendTelegram(chatId, 'Unsubscribed. Send /start to re-subscribe.');
    return;
  }

  // /help
  if (textLower === '/help' || textLower === '/help@mjk_bettingtips_bot') {
    await sendTelegram(chatId,
      'MJK Betting Tips — Commands\n\n' +
      '/tips — Today\'s top 10 tips\n' +
      '/bankers — Highest confidence picks (80%+)\n' +
      '/all — Full list of upcoming tips\n' +
      '/sport soccer — Tips for a specific sport\n' +
      '   Sports: soccer, tennis, nfl, nrl, mlb, afl, cricket\n' +
      '/stats — Overall win rate\n' +
      '/results — Recent results\n\n' +
      'Natural language: just type "tips", "bankers", "today", or a sport name.'
    );
    return;
  }

  // /tips
  if (textLower === '/tips' || textLower === '/tips@mjk_bettingtips_bot' || textLower === 'tips' || textLower === "today's tips" || textLower === 'today') {
    var tips = upcomingTips(cachedTips, isGroup ? TIERS.free.tipLimit : 10);
    if (isGroup) tips = tips.filter(function(t) { return t.type !== 'horse_racing'; });
    if (tips.length === 0) { await sendTelegram(chatId, 'No upcoming tips right now. Check back later!'); return; }
    var reply = '<b>MJK Tips — ' + (isGroup ? 'Free ' + tips.length : 'Top ' + tips.length) + '</b>\n\n';
    tips.forEach(function(t, i) { reply += formatTip(t, i + 1) + '\n\n'; });
    if (!isGroup) reply += 'Confidence min 70% | AI-powered predictions';
    else reply += 'Upgrade to Pro/Elite for full access';
    await sendTelegram(chatId, reply);
    return;
  }

  // /bankers
  if (textLower === '/bankers' || textLower === '/bankers@mjk_bettingtips_bot' || textLower === 'bankers') {
    var bankers = upcomingTips(cachedTips.filter(function(t) { return t.conf >= 80 && (isGroup ? t.type !== 'horse_racing' : true); }), isGroup ? 3 : 10);
    if (bankers.length === 0) { await sendTelegram(chatId, 'No bankers (80%+) available right now.'); return; }
    var reply = '<b>MJK Bankers — Highest Confidence</b>\n\n';
    bankers.forEach(function(t, i) { reply += formatTip(t, i + 1) + '\n\n'; });
    reply += 'Bankers = 80%+ confidence';
    await sendTelegram(chatId, reply);
    return;
  }

  // /all
  if (textLower === '/all' || textLower === '/all@mjk_bettingtips_bot' || textLower === 'all tips') {
    var tips = upcomingTips(cachedTips, isGroup ? TIERS.free.tipLimit : 50);
    if (isGroup) tips = tips.filter(function(t) { return t.type !== 'horse_racing'; });
    if (tips.length === 0) { await sendTelegram(chatId, 'No upcoming tips right now.'); return; }
    var bySport = {};
    tips.forEach(function(t) { if (!bySport[t.sport]) bySport[t.sport] = []; bySport[t.sport].push(t); });
    var reply = '<b>MJK ' + (isGroup ? 'Free ' : '') + 'Tips (' + tips.length + ')</b>\n\n';
    for (var sport in bySport) {
      reply += '<b>' + bySport[sport][0].icon + ' ' + sport + '</b>\n';
      bySport[sport].forEach(function(t, i) { reply += formatTip(t, i + 1) + '\n'; });
      reply += '\n';
    }
    if (isGroup) reply += 'Upgrade for full access — mjkbettingtips.com';
    await sendTelegram(chatId, reply);
    return;
  }

  // /sport <name>
  if (textLower.startsWith('/sport') || textLower.startsWith('/sport@mjk_bettingtips_bot')) {
    var parts = msg.text.trim().split(/\s+/);
    var query = (parts[1] || '').toLowerCase().replace(/@mjk_bettingtips_bot/gi, '');
    if (!query) { await sendTelegram(chatId, 'Usage: /sport <name>\nExample: /sport soccer\n\nSports: soccer, tennis, nfl, nrl, mlb, afl, cricket'); return; }
    var sportMap = {
      'soccer': 'soccer', 'football': 'soccer', 'epl': 'soccer_epl', 'fifa': 'soccer_fifa',
      'tennis': 'tennis', 'wimbledon': 'tennis',
      'nfl': 'americanfootball', 'football usa': 'americanfootball',
      'nrl': 'rugbyleague', 'rugby league': 'rugbyleague', 'rugby': 'rugbyleague',
      'mlb': 'baseball', 'baseball': 'baseball',
      'afl': 'aussierules', 'aussie rules': 'aussierules', 'australian football': 'aussierules',
      'cricket': 'cricket', 't20': 'cricket',
      'horse': 'horse_racing', 'horse racing': 'horse_racing', 'racing': 'horse_racing'
    };
    var matchKey = sportMap[query] || query;
    var tips = upcomingTips(cachedTips.filter(function(t) { return t.type.toLowerCase().indexOf(matchKey) >= 0 || t.sport.toLowerCase().indexOf(query) >= 0; }), 15);
    if (tips.length === 0) { await sendTelegram(chatId, 'No upcoming tips found for "' + query + '".'); return; }
    var reply = '<b>MJK Tips — ' + tips[0].sport + '</b>\n\n';
    tips.forEach(function(t, i) { reply += formatTip(t, i + 1) + '\n\n'; });
    await sendTelegram(chatId, reply);
    return;
  }

  // /stats
  if (textLower === '/stats' || textLower === '/stats@mjk_bettingtips_bot' || textLower === 'stats' || textLower === 'performance') {
    loadTrackedTips();
    var completed = trackedTips.filter(function(t) { return t.result === 'won' || t.result === 'lost'; });
    var won = completed.filter(function(t) { return t.result === 'won'; }).length;
    var total = completed.length;
    var rate = total > 0 ? (won / total * 100).toFixed(1) : '0.0';
    var pending = trackedTips.filter(function(t) { return t.result === 'pending'; }).length;
    await sendTelegram(chatId,
      '<b>MJK Performance Stats</b>\n\n' +
      'Completed: ' + total + '\n' +
      'Won: ' + won + '\n' +
      'Lost: ' + (total - won) + '\n' +
      'Win Rate: <b>' + rate + '%</b>\n' +
      'Pending: ' + pending + '\n' +
      'Total Tips: ' + trackedTips.length
    );
    return;
  }

  // /results
  if (textLower === '/results' || textLower === '/results@mjk_bettingtips_bot' || textLower === 'results') {
    loadTrackedTips();
    var recent = trackedTips.filter(function(t) { return t.result === 'won' || t.result === 'lost'; }).sort(function(a, b) { return (b.checkedAt || '').localeCompare(a.checkedAt || ''); }).slice(0, 10);
    if (recent.length === 0) { await sendTelegram(chatId, 'No completed results yet.'); return; }
    var reply = '<b>MJK Recent Results</b>\n\n';
    recent.forEach(function(t) {
      var icon = t.result === 'won' ? '✅' : '❌';
      reply += icon + ' ' + t.match + '\n   ' + t.pick + ' @ ' + t.odds + ' (' + t.conf + '%)\n\n';
    });
    await sendTelegram(chatId, reply);
    return;
  }
}

async function tgPollOnce() {
  if (!TELEGRAM_BOT_TOKEN || tgPolling) return;
  tgPolling = true;
  try {
    var res = await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/getUpdates?timeout=30' + (tgOffset ? '&offset=' + tgOffset : ''));
    if (res.ok) {
      var data = await res.json();
      if (data.ok && data.result) {
        for (var i = 0; i < data.result.length; i++) {
          var update = data.result[i];
          tgOffset = update.update_id + 1;
          await handleTelegramUpdate(update);
        }
      }
    }
  } catch (e) {
    console.log('[TELEGRAM] Poll error:', e.message || e);
  }
  tgPolling = false;
}

// === AUTO-PROMO: Send promotional message every 4 hours ===
function startPromoScheduler() {
  var promoMessages = [
    '🏆 <b>Why MJK Betting Tips?</b>\n\n' +
    '✅ AI-powered predictions across 10+ sports\n' +
    '✅ 70%+ win rate on tracked tips\n' +
    '✅ Horse racing, soccer, tennis, cricket & more\n' +
    '✅ Free daily tips in this group\n\n' +
    '🔗 Upgrade to Pro for full access:\n' +
    'Visit <b>mjkbettingtips.com</b>\n\n' +
    '💰 Starter from R700/week | Pro from R2,500/week | Elite from R6,570/mo',

    '📊 <b>Daily Tip Highlights</b>\n\n' +
    'Get <b>AI-analyzed tips</b> with confidence ratings daily!\n\n' +
    '🔥 Free tier: 3 tips/day (this group)\n' +
    '⚡ Starter tier: 10 tips — R700/week\n' +
    '⚡ Pro tier: 25 tips + horse racing — R2,500/week\n' +
    '💎 Elite tier: 30 tips + early access — R6,570/month\n\n' +
    'Join now 👉 mjkbettingtips.com',

    '🏇 <b>Horse Racing Fans!</b>\n\n' +
    'We cover horse racing with AI-powered predictions!\n' +
    'Best odds from top South African bookmakers.\n\n' +
    'Horse racing tips are available on <b>Pro & Elite</b> plans.\n\n' +
    '👉 mjkbettingtips.com',

    '⚽ <b>Weekend Ready?</b>\n\n' +
    'MJK Betting Tips has you covered for:\n' +
    '⚽ EPL & international soccer\n' +
    '🏏 Cricket T20s\n' +
    '🎾 Tennis Grand Slams\n' +
    '🏇 Horse Racing\n\n' +
    'Free tips posted daily — upgrade for full access!\n' +
    'mjkbettingtips.com'
  ];

  async function sendPromo() {
    var groupId = TELEGRAM_GROUP_ID;
    if (!groupId || !TELEGRAM_BOT_TOKEN) return;
    try {
      var lastPromo = {};
      try { lastPromo = JSON.parse(fs.readFileSync(TG_LAST_PROMO_FILE, 'utf8')); } catch (e) {}
      var now = Date.now();
      var lastTime = lastPromo.time || 0;
      // Only send once per day (24 hours)
      if (now - lastTime < 24 * 60 * 60 * 1000) return;

      var idx = (lastPromo.index || 0) % promoMessages.length;
      await sendTelegram(groupId, promoMessages[idx]);
      saveJSON(TG_LAST_PROMO_FILE, { time: now, index: idx + 1 });
      console.log('[TELEGRAM] Sent promo #' + (idx + 1) + ' to group');
    } catch (e) {
      console.log('[TELEGRAM] Promo error:', e.message || e);
    }
  }

  // Check every hour
  setInterval(sendPromo, 60 * 60 * 1000);
  // Also send one 5 minutes after startup (for first deploy)
  setTimeout(sendPromo, 5 * 60 * 1000);
}

function startTelegramBot() {
  if (!TELEGRAM_BOT_TOKEN) { console.log('[TELEGRAM] No bot token — Telegram bot disabled'); return; }
  console.log('[TELEGRAM] Starting long-polling bot...');
  console.log('[TELEGRAM] Smart features: link blocking, welcome, translation, promo');
  async function pollLoop() {
    await tgPollOnce();
    setTimeout(pollLoop, 1000);
  }
  pollLoop();
  startPromoScheduler();
}

// === API ROUTES ===

// Auth (rate limited: 10 requests per 15 min per IP)
app.post('/api/auth/register', rateLimit(15 * 60 * 1000, 10), function(req, res) {
  var username = sanitizeInput(req.body.username);
  var password = req.body.password || '';
  if (!USERNAME_REGEX.test(username)) return res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters or underscores' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be 8+ characters with uppercase, lowercase, and number' });
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: 'Password must include uppercase, lowercase, and a number' });
  var users = loadUsers();
  if (users[username]) return res.status(409).json({ error: 'Username taken' });
  users[username] = { id: 'user-' + Date.now(), username: username, password: hashPassword(password), tier: 'free', role: 'user', createdAt: new Date().toISOString(), subs: {} };
  saveUsers(users);
  res.json({ token: generateToken(users[username]), user: { username: username, tier: 'free', role: 'user' } });
});

app.post('/api/auth/login', rateLimit(15 * 60 * 1000, 15), function(req, res) {
  var username = (req.body.username || '').trim().toLowerCase();
  var password = req.body.password || '';
  var users = loadUsers();
  var user = users[username];
  if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: generateToken(user), user: { username: username, tier: user.tier, role: user.role } });
});

app.get('/api/auth/me', authMiddleware, function(req, res) {
  var users = loadUsers();
  var user = users[req.user.username];
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ username: req.user.username, tier: user.tier, role: user.role, createdAt: user.createdAt });
});

// Admin endpoints
// Tips (with tier-based limits)
app.get('/api/tips', rateLimit(30000, 30), function(req, res) {
  var tipCount = cachedTips.length;
  var tips = cachedTips;
  var header = req.headers.authorization;
  var userTier = 'free';
  if (header && header.startsWith('Bearer ')) {
    try { var decoded = jwt.verify(header.split(' ')[1], JWT_SECRET); userTier = decoded.tier; } catch (e) {}
  }
  var tier = TIERS[userTier] || TIERS.free;
  var isAdmin = false;
  var username = '';
  if (header && header.startsWith('Bearer ')) {
    try { var decoded = jwt.verify(header.split(' ')[1], JWT_SECRET); isAdmin = decoded.role === 'admin'; username = decoded.username; } catch (e) {}
  }
  // Hide horse racing tips for tiers without access
  if (!tier.horseRacing) tips = tips.filter(function(t) { return t.type !== 'horse_racing'; });
  // Apply sport filtering for Elite tier
  if (tier.sportFiltering && username) {
    var prefs = loadSportPrefs();
    var userPrefs = prefs[username] || {};
    var hasFilters = Object.keys(userPrefs).some(function(k) { return userPrefs[k] === false; });
    if (hasFilters) tips = tips.filter(function(t) { return userPrefs[t.type] !== false; });
  }
  if (!isAdmin && tips.length > tier.tipLimit) tips = tips.slice(0, tier.tipLimit);
  var highConf = tips.filter(function(t) { return t.conf >= 80; });
  var seen = new Set(); var bankers = [];
  for (var i = 0; i < highConf.length && bankers.length < 3; i++) { if (!seen.has(highConf[i].type)) { seen.add(highConf[i].type); bankers.push(highConf[i]); } }
  var sportsMap = {};
  for (var i = 0; i < tips.length; i++) { if (!sportsMap[tips[i].type]) sportsMap[tips[i].type] = { key: tips[i].type, name: tips[i].sport, icon: tips[i].icon }; }
  res.json({ lastGenerated: lastGenerated, source: 'live', oddsSource: 'the-odds-api', sports: Object.values(sportsMap), count: tipCount, limit: tier.tipLimit, userTier: userTier, tips: tips, bankers: bankers });
});

// === LIVE SCORES: Real-time score tracking for active tips ===
var liveScoreCache = {};
var liveScoreLastFetch = 0;

async function fetchLiveScores() {
  var now = Date.now();
  if (now - liveScoreLastFetch < 60000) return liveScoreCache; // Cache 1 min
  liveScoreLastFetch = now;
  var results = {};

  // Get pending soccer tips with active matches (started <2h ago)
  var activeSoccer = cachedTips.filter(function(t) {
    if (t.result !== 'pending' || !t.kickoff) return false;
    var ko = new Date(t.kickoff).getTime();
    var elapsed = now - ko;
    return elapsed > 0 && elapsed < 2 * 60 * 60 * 1000 && (t.type === 'soccer_epl' || t.type === 'soccer_fifa_world_cup');
  });

  if (activeSoccer.length > 0) {
    try {
      var dateFrom = new Date(now - 86400000).toISOString().split('T')[0];
      var dateTo = new Date(now + 86400000).toISOString().split('T')[0];
      var res = await fetch(FB_API_BASE + '/matches?dateFrom=' + dateFrom + '&dateTo=' + dateTo, { headers: { 'X-Auth-Token': FB_API_KEY } });
      if (res.ok) {
        var data = await res.json();
        if (data.matches) {
          for (var i = 0; i < activeSoccer.length; i++) {
            var tip = activeSoccer[i];
            var parts = tip.match.split(' vs ');
            var home = parts[0], away = parts[1];
            var match = data.matches.find(function(m) {
              return m.status === 'IN_PLAY' || m.status === 'PAUSED' || m.status === 'FINISHED';
            });
            // Try to find specific match
            match = data.matches.find(function(m) {
              var mh = m.homeTeam ? normalizeTeamName(m.homeTeam.name) : '';
              var ma = m.awayTeam ? normalizeTeamName(m.awayTeam.name) : '';
              return mh === normalizeTeamName(home) && ma === normalizeTeamName(away);
            });
            if (match && match.score && match.score.fullTime && match.score.fullTime.home !== null) {
              var status = match.status === 'FINISHED' ? 'FT' : (match.status === 'IN_PLAY' ? 'LIVE' : match.status === 'PAUSED' ? 'HT' : match.status);
              var elapsed = '';
              if (match.status === 'IN_PLAY' && match.minute) elapsed = match.minute + "'";
              results[tip.id || (tip.match + tip.pick)] = {
                homeScore: match.score.fullTime.home,
                awayScore: match.score.fullTime.away,
                status: status,
                elapsed: elapsed
              };
            }
          }
        }
      }
    } catch (e) {}
  }

  // Also check the-odds-api for non-soccer live scores
  var activeOther = cachedTips.filter(function(t) {
    if (t.result !== 'pending' || !t.kickoff) return false;
    var ko = new Date(t.kickoff).getTime();
    var elapsed = now - ko;
    return elapsed > 0 && elapsed < 4 * 60 * 60 * 1000 && t.type !== 'soccer_epl' && t.type !== 'soccer_fifa_world_cup' && t.type !== 'horse_racing';
  });

  if (activeOther.length > 0 && ODDS_API_KEY) {
    try {
      var typeSet = {};
      activeOther.forEach(function(t) { typeSet[t.type] = true; });
      for (var sportKey in typeSet) {
        var res2 = await fetch(ODDS_API_BASE + '/sports/' + sportKey + '/scores?apiKey=' + ODDS_API_KEY + '&daysFrom=1');
        if (res2.ok) {
          var scores = await res2.json();
          if (scores) {
            for (var i = 0; i < activeOther.length; i++) {
              var tip = activeOther[i];
              if (tip.type !== sportKey) continue;
              var parts = tip.match.split(' vs ');
              var match = scores.find(function(s) {
                return normalizeTeamName(s.home_team) === normalizeTeamName(parts[0]) && normalizeTeamName(s.away_team) === normalizeTeamName(parts[1]);
              });
              if (match && match.scores && match.scores.length >= 2) {
                results[tip.id || (tip.match + tip.pick)] = {
                  homeScore: parseInt(match.scores[0].score, 10),
                  awayScore: parseInt(match.scores[1].score, 10),
                  status: match.completed ? 'FT' : 'LIVE',
                  elapsed: ''
                };
              }
            }
          }
        }
      }
    } catch (e) {}
  }

  liveScoreCache = results;
  return results;
}

app.get('/api/scores/live', async function(req, res) {
  try {
    var scores = await fetchLiveScores();
    res.json(scores);
  } catch (e) {
    res.json({});
  }
});

// Premium: Bankers-only feed
app.get('/api/premium/bankers', authMiddleware, function(req, res) {
  var users = loadUsers(); var user = users[req.user.username];
  var tier = TIERS[user.tier] || TIERS.free;
  if (!tier.bankersOnly && user.tier !== 'elite' && user.role !== 'admin') return res.status(403).json({ error: 'Elite subscription required for bankers-only feed' });
  var bankers = cachedTips.filter(function(t) { return t.conf >= 85; });
  res.json({ count: bankers.length, tips: bankers.slice(0, 20) });
});

// Premium: Unlimited tips (uncapped)
app.get('/api/premium/unlimited', authMiddleware, function(req, res) {
  var users = loadUsers(); var user = users[req.user.username];
  var tier = TIERS[user.tier] || TIERS.free;
  if (tier.tipLimit === Infinity) {
    res.json({ count: cachedTips.length, tips: cachedTips });
  } else {
    var allTips = loadJSON(RESULTS_FILE, []);
    var tips = allTips.filter(function(t) { return t.result === 'pending'; });
    res.json({ count: tips.length, tips: tips.slice(0, 200) });
  }
});

// Premium: Acca builder
app.get('/api/premium/acca', authMiddleware, function(req, res) {
  var users = loadUsers(); var user = users[req.user.username];
  var tier = TIERS[user.tier] || TIERS.free;
  if (!tier.accaBuilder) return res.status(403).json({ error: 'Pro+ subscription required for acca builder' });
  var selections = (req.query.picks || '').split(',').filter(Boolean).map(Number);
  var picks = selections.map(function(i) { return cachedTips[i]; }).filter(Boolean);
  if (picks.length < 2) return res.json({ error: 'Need at least 2 selections', tips: cachedTips.slice(0, 20) });
  var combined = picks.reduce(function(a, t) { return a * (parseFloat(t.odds) || 1); }, 1);
  res.json({ picks: picks, legs: picks.length, combinedOdds: combined.toFixed(2), potentialReturn: combined > 0 ? 'R' + (combined * 100).toFixed(2) : 'N/A' });
});

// Premium: ROI dashboard
app.get('/api/premium/roi', authMiddleware, function(req, res) {
  var users = loadUsers(); var user = users[req.user.username];
  var tier = TIERS[user.tier] || TIERS.free;
  if (!tier.roiDashboard) return res.status(403).json({ error: 'Pro+ subscription required for ROI dashboard' });
  var completed = trackedTips.filter(function(t) { return t.result === 'won' || t.result === 'lost'; });
  var won = completed.filter(function(t) { return t.result === 'won'; });
  var lost = completed.filter(function(t) { return t.result === 'lost'; });
  var totalBets = completed.length;
  var totalStake = totalBets * 100;
  var totalReturn = won.reduce(function(s, t) { return s + 100 * (parseFloat(t.odds) || 2); }, 0);
  var roi = totalStake > 0 ? ((totalReturn - totalStake) / totalStake * 100) : 0;
  res.json({ totalBets: totalBets, won: won.length, lost: lost.length, winRate: totalBets > 0 ? (won.length / totalBets * 100).toFixed(1) : '0.0', totalStake: totalStake.toFixed(2), totalReturn: totalReturn.toFixed(2), profit: (totalReturn - totalStake).toFixed(2), roi: roi.toFixed(1) + '%' });
});

// Premium: Monthly report
app.get('/api/premium/report', authMiddleware, function(req, res) {
  var users = loadUsers(); var user = users[req.user.username];
  var tier = TIERS[user.tier] || TIERS.free;
  if (!tier.monthlyReport) return res.status(403).json({ error: 'Elite subscription required for monthly reports' });
  var now = new Date();
  var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  var monthTips = trackedTips.filter(function(t) { return t.checkedAt && t.checkedAt >= monthStart; });
  var won = monthTips.filter(function(t) { return t.result === 'won'; });
  var lost = monthTips.filter(function(t) { return t.result === 'lost'; });
  var totalStake = monthTips.length * 100;
  var totalReturn = won.reduce(function(s, t) { return s + 100 * (parseFloat(t.odds) || 2); }, 0);
  var bySport = {};
  for (var i = 0; i < monthTips.length; i++) {
    var t = monthTips[i]; if (!bySport[t.sport]) bySport[t.sport] = { won: 0, lost: 0 };
    bySport[t.sport][t.result === 'won' ? 'won' : 'lost']++;
  }
  res.json({ month: now.toISOString().slice(0, 7), total: monthTips.length, won: won.length, lost: lost.length, winRate: monthTips.length > 0 ? (won.length / monthTips.length * 100).toFixed(1) : '0', roi: totalStake > 0 ? ((totalReturn - totalStake) / totalStake * 100).toFixed(1) : '0', bySport: bySport });
});

// Premium: Sport filtering
app.post('/api/premium/sport-prefs', authMiddleware, function(req, res) {
  var users = loadUsers(); var user = users[req.user.username];
  var tier = TIERS[user.tier] || TIERS.free;
  if (!tier.sportFiltering) return res.status(403).json({ error: 'Elite subscription required for sport filtering' });
  var prefs = loadSportPrefs();
  if (!prefs[req.user.username]) prefs[req.user.username] = {};
  prefs[req.user.username][req.body.sport] = req.body.enabled;
  saveSportPrefs(prefs);
  res.json({ success: true, prefs: prefs[req.user.username] });
});

app.get('/api/premium/sport-prefs', authMiddleware, function(req, res) {
  var prefs = loadSportPrefs();
  res.json({ prefs: prefs[req.user.username] || {} });
});

// Premium: API key management
app.post('/api/premium/api-key', authMiddleware, function(req, res) {
  var users = loadUsers(); var user = users[req.user.username];
  var tier = TIERS[user.tier] || TIERS.free;
  if (!tier.apiAccess) return res.status(403).json({ error: 'Elite subscription required for API access' });
  var keys = loadApiKeys();
  var existing = keys[req.user.username];
  if (existing) return res.json({ apiKey: existing, message: 'Existing key' });
  var apiKey = 'mjk_' + crypto.randomBytes(24).toString('hex');
  keys[req.user.username] = apiKey;
  saveApiKeys(keys);
  res.json({ apiKey: apiKey });
});

app.get('/api/premium/api-key', authMiddleware, function(req, res) {
  var keys = loadApiKeys();
  res.json({ apiKey: keys[req.user.username] || null });
});

// Public API key access
app.get('/api/v1/tips', function(req, res) {
  var key = req.query.api_key || req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'API key required' });
  var keys = loadApiKeys();
  var found = null;
  for (var u in keys) { if (keys[u] === key) { found = u; break; } }
  if (!found) return res.status(403).json({ error: 'Invalid API key' });
  res.json({ source: 'MJK Betting Tips API', count: cachedTips.length, tips: cachedTips });
});

// Existing endpoints
app.get('/api/stats', rateLimit(60000, 15), function(req, res) {
  loadTrackedTips(); loadCalibration();
  var bySport = {};
  for (var i = 0; i < trackedTips.length; i++) {
    var t = trackedTips[i]; if (!bySport[t.sport]) bySport[t.sport] = { sport: t.sport, type: t.type, won: 0, lost: 0, pending: 0, total: 0 };
    bySport[t.sport][t.result]++; bySport[t.sport].total++;
  }
  var sportStats = Object.values(bySport);
  var totalWon = sportStats.reduce(function(s, x) { return s + x.won; }, 0);
  var totalLost = sportStats.reduce(function(s, x) { return s + x.lost; }, 0);
  var totalPending = sportStats.reduce(function(s, x) { return s + x.pending; }, 0);
  var calibBuckets = [];
  for (var bucket in calibration.buckets) {
    var data = calibration.buckets[bucket];
    var total = data.won + data.lost;
    calibBuckets.push({ bucket: bucket, won: data.won, lost: data.lost, total: total, rate: total > 0 ? (data.won / total * 100).toFixed(1) : '0.0' });
  }
  res.json({ total: { won: totalWon, lost: totalLost, pending: totalPending, winRate: totalWon + totalLost > 0 ? (totalWon / (totalWon + totalLost) * 100).toFixed(1) : '0.0' }, sports: sportStats.map(function(s) { return Object.assign({}, s, { winRate: s.won + s.lost > 0 ? (s.won / (s.won + s.lost) * 100).toFixed(1) : '0.0' }); }), calibration: calibBuckets });
});

app.get('/api/weights', function(req, res) {
  loadWeights(); var out = {};
  for (var i = 0; i < SPORTS.length; i++) { out[SPORTS[i].key] = getWeights(SPORTS[i].key); }
  res.json(out);
});

app.get('/api/history', rateLimit(60000, 15), function(req, res) {
  loadTrackedTips();
  var completed = trackedTips.filter(function(t) { return t.result === 'won' || t.result === 'lost'; }).sort(function(a, b) { return (b.kickoff || '').localeCompare(a.kickoff || ''); });
  res.json({ count: completed.length, tips: completed.slice(0, 100) });
});

app.get('/api/tiers', function(req, res) {
  res.json(TIERS);
});

app.get('/api/sports', function(req, res) {
  res.json(SPORTS);
});

// === NEW: Backtest & Analysis endpoint ===
app.get('/api/backtest', authMiddleware, adminMiddleware, function(req, res) {
  loadTrackedTips(); loadCalibration(); loadFeatureLogs(); loadModelCoeffs();
  var completed = trackedTips.filter(function(t) { return t.result === 'won' || t.result === 'lost'; });
  var total = completed.length;
  var won = completed.filter(function(t) { return t.result === 'won'; }).length;
  var lost = completed.filter(function(t) { return t.result === 'lost'; }).length;
  var winRate = total > 0 ? (won / total * 100).toFixed(1) : '0.0';

  // By confidence bucket
  var byConf = {};
  var buckets = ['70-74', '75-79', '80-84', '85-89', '90-96'];
  for (var bi = 0; bi < buckets.length; bi++) {
    var bk = buckets[bi];
    var tips = completed.filter(function(t) { return t.conf >= parseInt(bk.split('-')[0]) && t.conf <= parseInt(bk.split('-')[1]); });
    var bw = tips.filter(function(t) { return t.result === 'won'; }).length;
    var bl = tips.filter(function(t) { return t.result === 'lost'; }).length;
    byConf[bk] = { total: tips.length, won: bw, lost: bl, rate: tips.length > 0 ? (bw / tips.length * 100).toFixed(1) : '0.0' };
  }

  // By sport
  var bySport = {};
  for (var i = 0; i < completed.length; i++) {
    var t = completed[i];
    if (!bySport[t.sport]) bySport[t.sport] = { total: 0, won: 0, lost: 0 };
    bySport[t.sport].total++;
    bySport[t.sport][t.result === 'won' ? 'won' : 'lost']++;
  }
  var sportArr = [];
  for (var s in bySport) sportArr.push({ sport: s, total: bySport[s].total, won: bySport[s].won, lost: bySport[s].lost, rate: (bySport[s].won / bySport[s].total * 100).toFixed(1) });

  // Calibration analysis
  var calibOut = [];
  for (var bucket in calibration.buckets) {
    var data = calibration.buckets[bucket];
    var ct = data.won + data.lost;
    calibOut.push({ bucket: bucket, total: ct, won: data.won, lost: data.lost, actualRate: ct > 0 ? (data.won / ct * 100).toFixed(1) : '0.0' });
  }

  // ML model status
  var mlStatus = {};
  for (var si = 0; si < SPORTS.length; si++) {
    var sk = SPORTS[si].key;
    var m = modelCoeffs[sk];
    mlStatus[sk] = { trained: !!m, samples: m ? m.samples || 0 : 0, trainedAt: m ? m.trainedAt || null : null, models: m && m.models ? m.models.length : 1 };
  }

  // Feature logs count
  var featCount = featureLogs.length;

  // Weakest spots (sports with < 50% win rate)
  var weakSpots = sportArr.filter(function(s) { return parseFloat(s.rate) < 50; });

  res.json({
    overall: { total: total, won: won, lost: lost, winRate: winRate },
    byConfidence: byConf,
    bySport: sportArr,
    calibration: calibOut,
    mlModels: mlStatus,
    featureLogs: featCount,
    weakSpots: weakSpots,
    disabledSports: disabledSports,
    recommendations: Object.keys(disabledSports).length > 0 ? ('Auto-disabled: ' + Object.keys(disabledSports).join(', ') + '. Weak: ' + (weakSpots.length > 0 ? weakSpots.map(function(s) { return s.sport; }).join(', ') : 'none')) : (weakSpots.length > 0 ? 'Consider disabling tips for: ' + weakSpots.map(function(s) { return s.sport; }).join(', ') : 'All sports performing adequately')
  });
});

app.post('/api/auth/forgot-password', function(req, res) {
  var username = (req.body.username || '').trim().toLowerCase();
  var users = loadUsers();
  if (!users[username]) return res.json({ success: true, message: 'If the user exists, a reset link has been generated.' });
  var resetToken = crypto.randomBytes(32).toString('hex');
  users[username].resetToken = resetToken;
  users[username].resetExpires = Date.now() + 3600000;
  saveUsers(users);
  console.log('[AUTH] Password reset requested for ' + username + ' (token hidden)');
  res.json({ success: true, message: 'Reset token generated. Use /api/auth/reset-password to reset.' });
});

app.post('/api/auth/reset-password', function(req, res) {
  var username = (req.body.username || '').trim().toLowerCase();
  var token = req.body.token || '';
  var newPassword = req.body.password || '';
  if (!username || !token || !newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Invalid request. Password must be 4+ chars.' });
  var users = loadUsers();
  var user = users[username];
  if (!user || user.resetToken !== token || !user.resetExpires || Date.now() > user.resetExpires) return res.status(400).json({ error: 'Invalid or expired reset token.' });
  user.password = hashPassword(newPassword);
  delete user.resetToken;
  delete user.resetExpires;
  saveUsers(users);
  res.json({ success: true, message: 'Password reset successfully.' });
});

app.post('/api/subscribe', authMiddleware, function(req, res) {
  var tier = req.body.tier;
  if (!TIERS[tier]) return res.status(400).json({ error: 'Invalid tier' });
  if (tier === 'free') return res.status(400).json({ error: 'Already on free tier' });
  var users = loadUsers();
  var user = users[req.user.username];
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (user.tier !== 'free') return res.status(400).json({ error: 'Already subscribed. Contact admin to change tier.' });
  var paymentRef = req.body.paymentRef || '';
  if (!paymentRef || paymentRef.length < 5) return res.status(400).json({ error: 'Payment reference required. Complete payment first.' });
  var msg = 'Subscription request: @' + req.user.username + ' wants ' + tier + ' plan (R' + TIERS[tier].price + ') ref: ' + paymentRef;
  console.log('[SUB] ' + msg);
  user.tier = tier;
  user.subscribedAt = new Date().toISOString();
  user.paymentRef = paymentRef;
  saveUsers(users);
  if (TELEGRAM_BOT_TOKEN) {
    loadTelegramSubs().forEach(function(s) { sendTelegram(s.chatId, 'New subscriber: @' + req.user.username + ' → ' + tier); });
  }
  res.json({ success: true, tier: tier, message: 'Upgraded to ' + tier + '.' });
});

const ADMIN_PHONE = '27677834591';

function formatTelegramGroupMsg(tips) {
  var now = new Date();
  var dateStr = now.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var msg = '<b>MJK Betting Tips — ' + dateStr + '</b>\n\n';
  var seen = {};
  var count = 0;
  for (var i = 0; i < tips.length; i++) {
    var t = tips[i];
    if (seen[t.type]) continue;
    seen[t.type] = true;
    count++;
    var kickoff = t.kickoff ? new Date(t.kickoff).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : 'TBD';
    msg += t.icon + ' <b>' + t.match + '</b>\n';
    msg += '   ' + t.pick + ' @ <b>' + t.odds + '</b> (' + t.conf + '%)\n';
    msg += '   ' + t.market + ' · ' + kickoff + (t.valueBet ? ' · VALUE' : '') + '\n\n';
  }
  var highConf = tips.filter(function(t) { return t.conf >= 80; });
  if (highConf.length > 0) {
    msg += '<b>BANKERS (80%+):</b>\n';
    var bs = {};
    for (var i = 0; i < highConf.length && Object.keys(bs).length < 3; i++) {
      var b = highConf[i];
      if (bs[b.type]) continue;
      bs[b.type] = true;
      msg += '⭐ ' + b.match + '\n   ' + b.pick + ' @ ' + b.odds + ' (' + b.conf + '%)\n';
    }
    msg += '\n';
  }
  msg += 'Free tips · AI-powered · 65%+ confidence\nUpgrade to Pro/Elite for full access — /tips for more';
  return msg;
}

function formatTipsForWhatsApp(tips) {
  var now = new Date();
  var dateStr = now.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var msg = '*MJK Betting Tips — ' + dateStr + '*\n\n';
  var bySport = {};
  for (var i = 0; i < tips.length; i++) {
    var t = tips[i];
    var sportKey = t.type || 'other';
    if (!bySport[sportKey]) bySport[sportKey] = { name: t.sport || sportKey, icon: t.icon || '', tips: [] };
    bySport[sportKey].tips.push(t);
  }
  for (var sk in bySport) {
    var group = bySport[sk];
    msg += '*' + group.icon + ' ' + group.name + '*\n';
    for (var i = 0; i < group.tips.length; i++) {
      var t = group.tips[i];
      var kickoff = t.kickoff ? new Date(t.kickoff).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : 'TBD';
      msg += (i + 1) + '. ' + t.match + '\n';
      msg += '   ' + t.pick + ' @ ' + t.odds + ' (' + t.conf + '%)\n';
      msg += '   ' + t.market + ' | ' + kickoff + (t.valueBet ? ' | VALUE' : '') + '\n';
    }
    msg += '\n';
  }
  var upcoming = tips.filter(function(t) { return t.kickoff && new Date(t.kickoff).getTime() > Date.now(); });
  var highConf = upcoming.filter(function(t) { return t.conf >= 80; });
  if (highConf.length > 0) {
    msg += '*BANKERS (80%+):*\n';
    var seen = {};
    for (var i = 0; i < highConf.length && Object.keys(seen).length < 3; i++) {
      var b = highConf[i];
      if (seen[b.type]) continue;
      seen[b.type] = true;
      msg += '⭐ ' + b.match + '\n   ' + b.pick + ' @ ' + b.odds + ' (' + b.conf + '%)\n';
    }
    msg += '\n';
  }
  msg += 'AI-powered predictions | Confidence 65%+\nmjkbettingtips.com';
  return msg;
}

async function sendWhatsAppMessage(to, body) {
  if (!WHATSAPP_INSTANCE_ID || !WHATSAPP_TOKEN) { console.log('[WHATSAPP] UltraMsg not configured — skipping'); return false; }
  try {
    var res = await fetch('https://api.ultramsg.com/' + WHATSAPP_INSTANCE_ID + '/messages/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: WHATSAPP_TOKEN, to: to, body: body })
    });
    var data = await res.json();
    if (data.sent === true || data.messageId) { console.log('[WHATSAPP] Sent to ' + to + ' (id: ' + (data.messageId || 'ok') + ')'); return true; }
    else { console.log('[WHATSAPP] Failed: ' + JSON.stringify(data).slice(0, 200)); return false; }
  } catch (e) { console.log('[WHATSAPP] Error: ' + (e.message || e)); return false; }
}

async function sendDailyBroadcast() {
  if (!cachedTips || cachedTips.length === 0) { console.log('[BROADCAST] No tips to broadcast'); return; }
  var upcoming = cachedTips.filter(function(t) { return t.kickoff && new Date(t.kickoff).getTime() > Date.now(); });
  if (upcoming.length === 0) { console.log('[BROADCAST] No upcoming tips'); return; }
  var msg = formatTipsForWhatsApp(upcoming);
  var plainMsg = msg.replace(/\*/g, '');
  console.log('[BROADCAST] Sending daily tips to admin (' + upcoming.length + ' tips)');
  var waSent = await sendWhatsAppMessage(ADMIN_WHATSAPP, plainMsg);
  if (!waSent) console.log('[BROADCAST] WhatsApp delivery failed — tips logged to data/last_broadcast.json');
  if (TELEGRAM_BOT_TOKEN) {
    var adminSubs = loadTelegramSubs();
    for (var i = 0; i < adminSubs.length; i++) {
      await sendTelegram(adminSubs[i].chatId, plainMsg);
    }
  }
  if (TELEGRAM_GROUP_ID && TELEGRAM_BOT_TOKEN) {
    var freeTips = upcoming.filter(function(t) { return t.type !== 'horse_racing'; }).slice(0, TIERS.free.tipLimit);
    if (freeTips.length > 0) {
      var groupMsg = formatTelegramGroupMsg(freeTips);
      await sendTelegram(TELEGRAM_GROUP_ID, groupMsg);
      console.log('[BROADCAST] Sent ' + freeTips.length + ' free tips to Telegram group ' + TELEGRAM_GROUP_ID);
    }
  }
  var waUrl = 'https://wa.me/' + ADMIN_PHONE + '?text=' + encodeURIComponent(plainMsg);
  saveJSON(path.join(DATA_DIR, 'last_broadcast.json'), { sentAt: new Date().toISOString(), tipCount: upcoming.length, whatsappDelivered: waSent, message: msg, whatsappUrl: waUrl });
}

function scheduleDailyBroadcast() {
  var now = new Date();
  var saTime = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Johannesburg' }));
  var target = new Date(saTime);
  target.setHours(6, 0, 0, 0);
  if (saTime.getHours() >= 6) target.setDate(target.getDate() + 1);
  var delay = target.getTime() - saTime.getTime();
  console.log('[BROADCAST] Next daily broadcast in ' + Math.round(delay / 3600000) + ' hours');
  setTimeout(function() {
    sendDailyBroadcast();
    setInterval(sendDailyBroadcast, 86400000);
  }, delay);
}

// === ADMIN: USER MANAGEMENT ===
app.get('/api/admin/users', authMiddleware, adminMiddleware, function(req, res) {
  var users = loadUsers();
  var list = Object.keys(users).map(function(k) {
    return { username: k, tier: users[k].tier, role: users[k].role, createdAt: users[k].createdAt, subscribedAt: users[k].subscribedAt || null };
  });
  res.json({ users: list, total: list.length });
});

app.post('/api/admin/set-tier', authMiddleware, adminMiddleware, function(req, res) {
  var targetUser = sanitizeInput(req.body.username);
  var newTier = req.body.tier;
  if (!targetUser || !USERNAME_REGEX.test(targetUser)) return res.status(400).json({ error: 'Invalid username (3-20 alphanumeric/underscore chars)' });
  if (!newTier || !TIERS[newTier]) return res.status(400).json({ error: 'Valid tier required (free, starter, pro, elite)' });
  var users = loadUsers();
  if (!users[targetUser]) return res.status(404).json({ error: 'User not found' });
  var oldTier = users[targetUser].tier;
  users[targetUser].tier = newTier;
  users[targetUser].subscribedAt = new Date().toISOString();
  users[targetUser].subscribedBy = req.user.username;
  saveUsers(users);
  console.log('[ADMIN] ' + req.user.username + ' changed ' + targetUser + ' from ' + oldTier + ' to ' + newTier);
  res.json({ success: true, username: targetUser, oldTier: oldTier, newTier: newTier });
});

app.post('/api/admin/delete-user', authMiddleware, adminMiddleware, function(req, res) {
  var targetUser = sanitizeInput(req.body.username);
  if (!targetUser || !USERNAME_REGEX.test(targetUser)) return res.status(400).json({ error: 'Invalid username' });
  var users = loadUsers();
  if (!users[targetUser]) return res.status(404).json({ error: 'User not found' });
  if (users[targetUser].role === 'admin') return res.status(403).json({ error: 'Cannot delete admin' });
  delete users[targetUser];
  saveUsers(users);
  console.log('[ADMIN] ' + req.user.username + ' deleted user ' + targetUser);
  res.json({ success: true, username: targetUser });
});

app.get('/api/admin/stats', authMiddleware, adminMiddleware, function(req, res) {
  var users = loadUsers();
  var allUsers = Object.keys(users);
  var tiers = { free: 0, starter: 0, pro: 0, elite: 0 };
  allUsers.forEach(function(k) { var t = users[k].tier || 'free'; tiers[t] = (tiers[t] || 0) + 1; });
  loadTrackedTips();
  var completed = trackedTips.filter(function(t) { return t.result === 'won' || t.result === 'lost'; });
  var won = completed.filter(function(t) { return t.result === 'won'; }).length;
  var pending = trackedTips.filter(function(t) { return t.result === 'pending'; }).length;
  var subs = loadTelegramSubs();
  res.json({
    totalUsers: allUsers.length,
    tiers: tiers,
    totalTips: trackedTips.length,
    completedTips: completed.length,
    wonTips: won,
    lostTips: completed.length - won,
    winRate: completed.length > 0 ? (won / completed.length * 100).toFixed(1) : '0.0',
    pendingTips: pending,
    telegramSubs: subs.length,
    cachedTips: cachedTips.length
  });
});

app.get('/api/admin/user/:username', authMiddleware, adminMiddleware, function(req, res) {
  var users = loadUsers();
  var user = users[req.params.username];
  if (!user) return res.status(404).json({ error: 'User not found' });
  loadTrackedTips();
  var userTips = trackedTips.filter(function(t) { return t.result === 'won' || t.result === 'lost'; });
  res.json({
    username: req.params.username,
    tier: user.tier,
    role: user.role,
    createdAt: user.createdAt,
    subscribedAt: user.subscribedAt || null,
    subscribedBy: user.subscribedBy || null
  });
});

app.post('/api/admin/broadcast', authMiddleware, adminMiddleware, function(req, res) {
  sendDailyBroadcast().then(function() { res.json({ success: true, message: 'Daily broadcast sent to admin via WhatsApp + Telegram' }); }).catch(function(e) { res.status(500).json({ error: e.message }); });
});

app.post('/api/admin/send-now', authMiddleware, adminMiddleware, async function(req, res) {
  if (!cachedTips || cachedTips.length === 0) return res.json({ error: 'No tips available' });
  var upcoming = cachedTips.filter(function(t) { return t.kickoff && new Date(t.kickoff).getTime() > Date.now(); });
  var msg = formatTipsForWhatsApp(upcoming).replace(/\*/g, '');
  var waSent = await sendWhatsAppMessage(ADMIN_WHATSAPP, msg);
  res.json({ whatsapp: waSent ? 'sent' : 'failed', tipCount: upcoming.length });
});

app.get('/api/admin/whatsapp-link', authMiddleware, adminMiddleware, function(req, res) {
  var upcoming = cachedTips.filter(function(t) { return t.kickoff && new Date(t.kickoff).getTime() > Date.now(); });
  var msg = formatTipsForWhatsApp(upcoming).replace(/\*/g, '');
  var waUrl = 'https://wa.me/' + ADMIN_PHONE + '?text=' + encodeURIComponent(msg);
  res.json({ url: waUrl, tipCount: upcoming.length });
});

// === PUSH NOTIFICATION SUBSCRIPTIONS ===
app.post('/api/push/subscribe', rateLimit(60 * 1000, 5), function(req, res) {
  var sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  var subs = loadPushSubs();
  var exists = subs.findIndex(function(s) { return s.endpoint === sub.endpoint; });
  if (exists >= 0) subs[exists] = sub; else subs.push(sub);
  savePushSubs(subs);
  console.log('[PUSH] New subscription (' + subs.length + ' total)');
  res.json({ success: true, total: subs.length });
});
app.post('/api/push/unsubscribe', function(req, res) {
  var endpoint = req.body.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  var subs = loadPushSubs();
  subs = subs.filter(function(s) { return s.endpoint !== endpoint; });
  savePushSubs(subs);
  res.json({ success: true });
});

// === LIVE ODDS COMPARISON ===
app.get('/api/odds/compare/:sport', async function(req, res) {
  var sport = req.params.sport;
  if (!ODDS_API_KEY) return res.json({ odds: [], message: 'Odds API not configured' });
  try {
    var data = await fetchLiveOdds(sport);
    res.json({ odds: data || [], sport: sport });
  } catch (e) {
    res.json({ odds: [], error: e.message });
  }
});

// === ADMIN: SEND PUSH NOTIFICATIONS ===
app.post('/api/admin/push-broadcast', authMiddleware, adminMiddleware, async function(req, res) {
  var title = req.body.title || 'MJK Betting Tips — New Tips!';
  var body = req.body.body || 'Check out today\'s AI-powered tips.';
  try {
    var sent = await sendPushToAll(title, body, '/');
    res.json({ success: true, message: 'Push sent to ' + sent + ' subscribers' });
  } catch (e) {
    res.status(500).json({ error: 'Failed: ' + e.message });
  }
});

// === STATIC FILES + CACHE HEADERS ===
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true,
  lastModified: true,
  setHeaders: function(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    else if (filePath.match(/\.(js|css)$/)) res.setHeader('Cache-Control', 'public, max-age=86400');
    else if (filePath.match(/\.(png|jpg|svg|ico|woff2?)$/)) res.setHeader('Cache-Control', 'public, max-age=604800');
  }
}));

// === ERROR LOGGING MIDDLEWARE ===
app.use(function(err, req, res, next) {
  console.error('[ERROR]', new Date().toISOString(), req.method, req.url, err.message || err);
  res.status(500).json({ error: 'Internal server error' });
});

loadTrackedTips(); loadElo(); loadForm(); loadWeights(); loadCalibration(); loadTeamStats(); loadH2H(); loadMatchDates(); loadModelCoeffs(); loadFeatureLogs(); loadSportHealth(); loadCachedOdds(); loadRacingEvents();
refreshTips();
setInterval(refreshTips, 300000);
setInterval(checkResults, 300000);
setInterval(function() { cleanResearchCache(); cleanRevokedTokens(); }, 3600000);
setInterval(function() { loadTrackedTips(); loadFeatureLogs(); for (var si = 0; si < SPORTS.length; si++) trainSportModel(SPORTS[si].key); checkSportHealth(); }, 1800000);

app.get('/health', function(req, res) { res.json({ status: 'ok', uptime: process.uptime() }); });

app.listen(port, function() {
  console.log('MJK Betting Tips v10 (Advanced AI + Smart TG Group + WhatsApp Broadcast) running on http://localhost:' + port);
  if (TELEGRAM_BOT_TOKEN) console.log('[TELEGRAM] Bot enabled (long-polling mode)');
  if (WHATSAPP_INSTANCE_ID) console.log('[WHATSAPP] UltraMsg enabled — daily broadcast to ' + ADMIN_WHATSAPP);
  else console.log('[WHATSAPP] UltraMsg not configured — add WHATSAPP_INSTANCE_ID + WHATSAPP_TOKEN to .env');
  console.log('[AUTH] Admin account: ' + ADMIN_USER);
  console.log('[AI] Dixon-Coles Poisson + Real football-data.org standings + form + H2H + fatigue tracking loaded');
  startTelegramBot();
  scheduleDailyBroadcast();
  setTimeout(function() { console.log('[AI] Fetching real standings + training models...'); loadTrackedTips(); fetchStandingsData().then(function() { trainAllModels(); checkSportHealth(); }); }, 5000);
});
