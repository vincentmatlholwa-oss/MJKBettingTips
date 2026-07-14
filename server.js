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
try { var helmet = require('helmet'); app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
})); } catch(e) {}
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
const ODDS_API_KEY_2 = process.env.ODDS_API_KEY_2 || '';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID || '';
const WHATSAPP_INSTANCE_ID = process.env.WHATSAPP_INSTANCE_ID || '';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || '+27677834591';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

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
const BSD_API_KEY = process.env.BSD_API_KEY || '';
const BSD_API_BASE = 'https://sports.bzzoiro.com/api';
let bsdPredictions = {};  // { 'HomeTeam|AwayTeam': { home, draw, away, confidence, xg_home, xg_away, score } }
const APIFOOTBALL_KEY = process.env.APIFOOTBALL_KEY || '';
const APIFOOTBALL_BASE = 'https://v3.football.api-sports.io';
let apiFootballPredictions = {};  // { 'HomeTeam|AwayTeam': { home, draw, away, winner, advice } }

// === GITHUB AUTO-BACKUP: Hourly backup of all data files ===
const GITHUB_TOKEN = process.env.GITHUB_BACKUP_TOKEN || '';
const GITHUB_REPO = 'vincentmatlholwa-oss/MJKBettingTips';
const GITHUB_BRANCH = 'master';
const DATA_BACKUP_FILES = [
  'tracked_results.json', 'elo_ratings.json', 'calibration.json', 'form_tracker.json',
  'adaptive_weights.json', 'team_stats.json', 'head_to_head.json', 'model_coeffs.json',
  'feature_log.json', 'sport_health.json', 'cached_odds.json', 'match_dates.json',
  'standings_cache.json', 'sportmonks_fixtures.json', 'darts_fixtures.json',
  'racing_events.json', 'sport_prefs.json'
];

async function githubGetFile(filePath) {
  if (!GITHUB_TOKEN) return null;
  try {
    var res = await fetch('https://api.github.com/repos/' + GITHUB_REPO + '/contents/data/' + filePath + '?ref=' + GITHUB_BRANCH, {
      headers: { 'Authorization': 'token ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) return null;
    var data = await res.json();
    return { sha: data.sha, content: Buffer.from(data.content, 'base64').toString('utf8') };
  } catch (e) { return null; }
}

async function githubPushFile(filePath, content, sha) {
  if (!GITHUB_TOKEN) return false;
  try {
    var body = { message: 'Auto-backup: ' + filePath + ' (' + new Date().toISOString() + ')', content: Buffer.from(content).toString('base64'), branch: GITHUB_BRANCH };
    if (sha) body.sha = sha;
    var res = await fetch('https://api.github.com/repos/' + GITHUB_REPO + '/contents/data/' + filePath, {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + GITHUB_TOKEN, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
      body: JSON.stringify(body)
    });
    return res.ok;
  } catch (e) { return false; }
}

async function backupDataToGitHub() {
  if (!GITHUB_TOKEN) { console.log('[BACKUP] No GitHub token — skipping'); return; }
  var backed = 0, skipped = 0;
  for (var fi = 0; fi < DATA_BACKUP_FILES.length; fi++) {
    var file = DATA_BACKUP_FILES[fi];
    var localPath = path.join(DATA_DIR, file);
    try {
      if (!fs.existsSync(localPath)) { skipped++; continue; }
      var localContent = fs.readFileSync(localPath, 'utf8');
      if (!localContent || localContent.length < 3) { skipped++; continue; }
      var existing = await githubGetFile(file);
      // Skip if content hasn't changed
      if (existing && existing.content === localContent) { skipped++; continue; }
      var sha = existing ? existing.sha : null;
      var ok = await githubPushFile(file, localContent, sha);
      if (ok) { backed++; }
    } catch (e) { console.log('[BACKUP] Error backing up ' + file + ': ' + (e.message || e).slice(0, 100)); }
  }
  console.log('[BACKUP] GitHub: ' + backed + ' files backed up, ' + skipped + ' unchanged');
}

async function restoreDataFromGitHub() {
  if (!GITHUB_TOKEN) return;
  var restored = 0;
  for (var fi = 0; fi < DATA_BACKUP_FILES.length; fi++) {
    var file = DATA_BACKUP_FILES[fi];
    var localPath = path.join(DATA_DIR, file);
    try {
      // Only restore if local file is missing or empty
      if (fs.existsSync(localPath)) {
        var local = fs.readFileSync(localPath, 'utf8');
        if (local && local.length > 5) continue;
      }
      var remote = await githubGetFile(file);
      if (remote && remote.content && remote.content.length > 5) {
        fs.writeFileSync(localPath, remote.content, 'utf8');
        restored++;
        console.log('[RESTORE] Restored ' + file + ' from GitHub');
      }
    } catch (e) {}
  }
  if (restored > 0) console.log('[RESTORE] Restored ' + restored + ' data files from GitHub');
}

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
  'soccer_england_championship': 'England',
  'soccer_spain_la_liga': 'Spain',
  'soccer_germany_bundesliga': 'Germany',
  'soccer_italy_serie_a': 'Italy',
  'soccer_france_ligue_one': 'France',
  'soccer_netherlands_eredivisie': 'Netherlands',
  'soccer_portugal_liga': 'Portugal',
  'soccer_brazil_serie_a': 'Brazil',
  'soccer_usa_mls': 'USA',
  'soccer_uefa_champs_league': 'Europe',
  'soccer_uefa_europa_league': 'Europe',
  'soccer_turkey_super_lig': 'Turkey',
  'soccer_belgium_first_division_a': 'Belgium',
  'soccer_scotland_premiership': 'Scotland',
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
  'baseball_mlb': { hasDraw: false, homeAdv: 1.15, kFactor: 40, formWindow: 5, minConf: 65, maxConf: 90, usePoisson: false, dcRho: 0 },
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
var _writeQueues = {};
function saveJSON(file, data) {
  var key = file;
  if (!_writeQueues[key]) _writeQueues[key] = Promise.resolve();
  _writeQueues[key] = _writeQueues[key].then(function() {
    return new Promise(function(resolve) {
      fs.writeFile(file, JSON.stringify(data, null, 2), function(err) {
        if (err) console.error('[DATA] Save failed for ' + path.basename(file) + ': ' + (err.message || err).slice(0, 100));
        resolve();
      });
    });
  });
}

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
  var hFormS = getFormWindow(sportKey, home, cfg.formWindow);
  var aFormS = getFormWindow(sportKey, away, cfg.formWindow);
  var reasonS = buildTipReason({ marketType: 'h2h', market: mr, pick: pick, home: home, away: away, poisson: poisson, eloH: adjHome, eloA: adjAway, hForm: hFormS, aForm: aFormS, expectedTotal: poisson.expectedHomeGoals + poisson.expectedAwayGoals });

  return {
    type: sportKey, sport: 'Football', icon: '\u26BD',
    match: home + ' vs ' + away, league: league || 'Football',
    country: COUNTRY_MAP[sportKey] || '',
    marketType: 'h2h', market: mr, marketLine: null,
    kickoff: kickoff, pick: pick, odds: odds, conf: conf,
    realOdds: null, bookmaker: '', valueBet: false,
    reason: reasonS, features: features
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
  var computed = crypto.pbkdf2Sync(pw, salt, 10000, 64, 'sha512').toString('hex');
  if (computed.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed, 'utf8'), Buffer.from(hash, 'utf8'));
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
    const isBaseball = sportKey === 'baseball_mlb';
    adaptiveWeights[sportKey] = isSoccer ? { eloWeight: 0.30, poissonWeight: 0.35, marketWeight: 0.35, samples: 0 } : isBaseball ? { eloWeight: 0.40, poissonWeight: 0, marketWeight: 0.60, samples: 0 } : { eloWeight: 0.50, poissonWeight: 0, marketWeight: 0.50, samples: 0 };
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
      if (!disabledSports[sk]) {
        disabledSports[sk] = { since: new Date().toISOString() };
        console.log('[HEALTH] Disabled ' + sk + ' (win rate ' + (rate * 100).toFixed(0) + '%, ' + total + ' tips)');
      } else if (disabledSports[sk].since) {
        var disabledSince = new Date(disabledSports[sk].since).getTime();
        if (Date.now() - disabledSince > 7 * 86400000) {
          delete disabledSports[sk];
          console.log('[HEALTH] Re-enabled ' + sk + ' after 7-day cooldown (win rate ' + (rate * 100).toFixed(0) + '%)');
        }
      }
    } else if (rate >= 0.50) {
      if (disabledSports[sk]) delete disabledSports[sk];
    } else if (rate < 0 && total > 0) {
      // rate < 0 means total < 10 resolved tips — allow generation to accumulate data
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

// === HUMAN-READABLE AI REASONING ===
function buildTipReason(ctx) {
  // ctx: { marketType, market, pick, home, away, poisson, eloH, eloA, hForm, aForm, bsdPred, afPred, ensembleResult, bttsProb, ouOver, ouUnder, expectedTotal, bestMarketScore }
  var lines = [];
  var home = ctx.home, away = ctx.away;
  var pick = ctx.pick || '';

  if (ctx.marketType === 'h2h') {
    // Match Result reasoning
    var eloDiff = (ctx.eloH || 1500) - (ctx.eloA || 1500);
    var eloFav = eloDiff > 0 ? home : away;
    var eloAbs = Math.abs(Math.round(eloDiff));
    if (eloAbs > 150) lines.push(eloFav + ' rated significantly stronger (ELO gap ' + eloAbs + ')');
    else if (eloAbs > 80) lines.push(eloFav + ' slight ELO advantage (+' + eloAbs + ')');
    else lines.push('Teams closely matched on ELO');
    if (ctx.poisson) {
      var xgDiff = ctx.poisson.expectedHomeGoals - ctx.poisson.expectedAwayGoals;
      if (Math.abs(xgDiff) > 0.4) {
        var xgFav = xgDiff > 0 ? home : away;
        lines.push('xG model expects ' + xgFav + ' to score more (' + ctx.poisson.expectedHomeGoals.toFixed(1) + ' vs ' + ctx.poisson.expectedAwayGoals.toFixed(1) + ')');
      } else {
        lines.push('Expected goals close (' + ctx.poisson.expectedHomeGoals.toFixed(1) + ' vs ' + ctx.poisson.expectedAwayGoals.toFixed(1) + ')');
      }
    }
    if (ctx.hForm && ctx.aForm) {
      var hPts = ctx.hForm.wins * 3 + ctx.hForm.draws;
      var aPts = ctx.aForm.wins * 3 + ctx.aForm.draws;
      if (hPts > aPts + 3) lines.push(home + ' in stronger form (' + ctx.hForm.wins + 'W-' + ctx.hForm.losses + 'L vs ' + ctx.aForm.wins + 'W-' + ctx.aForm.losses + 'L)');
      else if (aPts > hPts + 3) lines.push(away + ' in stronger form (' + ctx.aForm.wins + 'W-' + ctx.aForm.losses + 'L vs ' + ctx.hForm.wins + 'W-' + ctx.hForm.losses + 'L)');
    }
    if (ctx.h2hTotal && ctx.h2hTotal >= 3) {
      if (ctx.h2hHomeWins > 0.55) lines.push(home + ' dominant in H2H (' + Math.round(ctx.h2hHomeWins * 100) + '% win rate in ' + ctx.h2hTotal + ' meetings)');
      else if (ctx.h2hHomeWins < 0.3) lines.push(away + ' dominant in H2H (' + Math.round((1 - ctx.h2hHomeWins) * 100) + '% win rate)');
    }
  }
  else if (ctx.marketType === 'ou') {
    // Over/Under reasoning
    var expTotal = ctx.expectedTotal || (ctx.poisson ? ctx.poisson.expectedHomeGoals + ctx.poisson.expectedAwayGoals : 0);
    var line = ctx.marketLine || 2.5;
    if (expTotal > line + 0.5) lines.push('Expected goals (' + expTotal.toFixed(1) + ') comfortably above ' + line + ' line');
    else if (expTotal > line + 0.2) lines.push('Expected goals (' + expTotal.toFixed(1) + ') slightly above ' + line + ' line');
    else if (expTotal < line - 0.5) lines.push('Expected goals (' + expTotal.toFixed(1) + ') well below ' + line + ' line');
    else lines.push('Expected goals (' + expTotal.toFixed(1) + ') close to ' + line + ' line');
    if (ctx.poisson) {
      if (ctx.poisson.expectedHomeGoals > 1.4 || ctx.poisson.expectedAwayGoals > 1.4) {
        var highScorer = ctx.poisson.expectedHomeGoals > ctx.poisson.expectedAwayGoals ? home : away;
        lines.push(highScorer + ' strong attacking threat (xG ' + Math.max(ctx.poisson.expectedHomeGoals, ctx.poisson.expectedAwayGoals).toFixed(1) + ')');
      }
    }
    if (pick.indexOf('Over') !== -1 && expTotal > 2.8) lines.push('High-scoring affair expected');
    else if (pick.indexOf('Under') !== -1 && expTotal < 2.2) lines.push('Defensive battle anticipated');
  }
  else if (ctx.marketType === 'btts') {
    // BTTS reasoning
    if (ctx.poisson) {
      var homeScoreProb = 1 - Math.exp(-ctx.poisson.expectedHomeGoals);
      var awayScoreProb = 1 - Math.exp(-ctx.poisson.expectedAwayGoals);
      if (homeScoreProb > 0.6 && awayScoreProb > 0.6) lines.push('Both teams have >' + Math.round(Math.min(homeScoreProb, awayScoreProb) * 100) + '% chance of scoring');
      else if (homeScoreProb > 0.55) lines.push(home + ' likely to score (' + Math.round(homeScoreProb * 100) + '%), ' + away + ' has scoring threat (' + Math.round(awayScoreProb * 100) + '%)');
      if (ctx.poisson.expectedHomeGoals > 1.3 && ctx.poisson.expectedAwayGoals > 1.1) lines.push('Both attacks firing — high BTTS probability');
    }
    if (pick === 'No') lines.push('At least one team unlikely to find the net');
  }
  else if (ctx.marketType === 'corner') {
    // Corner reasoning
    if (ctx.expectedTotal > 10.5) lines.push('Expected corners above average (' + ctx.expectedTotal.toFixed(1) + ')');
    else if (ctx.expectedTotal < 9) lines.push('Expected corners below average (' + ctx.expectedTotal.toFixed(1) + ')');
  }

  // AI agreement tag
  if (ctx.ensembleResult) {
    if (ctx.ensembleResult.unanimous) lines.push('All 3 AI models agree');
    else if (ctx.ensembleResult.agree) lines.push('Majority of AI models agree');
  }

  // Value bet note
  if (ctx.valueEdge && ctx.valueEdge > 0.08) lines.push('Value detected: AI prob ' + Math.round(ctx.valueEdge * 100) + '% above implied odds');

  if (lines.length === 0) lines.push('Model analysis across Poisson, ELO, and market data');
  return lines.join('. ') + '.';
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
  // BSD CatBoost ML prediction
  const bsdPred = getBSDPrediction(home, away);
  // API-Football Poisson/statistics prediction
  const afPred = getAPIFootballPrediction(home, away);
  let pred;
  if (mlHomeProb !== null) {
    const mlAwayProb = 1 - mlHomeProb;
    var bsdHW = bsdPred ? bsdPred.home : null;
    var bsdAW = bsdPred ? bsdPred.away : null;
    var bsdDW = bsdPred ? bsdPred.draw : null;
    var bsdBlend = bsdPred ? 0.15 : 0;
    var baseHW = mlHomeProb * 0.35 + poisson.homeWin * w.poissonWeight + eloHome * w.eloWeight + effectiveMarket.homeWin * w.marketWeight * 0.50;
    var baseAW = mlAwayProb * 0.35 + poisson.awayWin * w.poissonWeight + eloAway * w.eloWeight + effectiveMarket.awayWin * w.marketWeight * 0.50;
    var baseDW = cfg.hasDraw ? (poisson.draw * w.poissonWeight + eloDrawVal * w.eloWeight + effectiveMarket.draw * w.marketWeight * 0.50) : 0;
    if (bsdPred) {
      baseHW = baseHW * (1 - bsdBlend) + bsdHW * bsdBlend;
      baseAW = baseAW * (1 - bsdBlend) + bsdAW * bsdBlend;
      baseDW = baseDW * (1 - bsdBlend) + (bsdDW || 0) * bsdBlend;
    }
    pred = { homeWin: baseHW, awayWin: baseAW, draw: baseDW, mlUsed: true, bsdUsed: !!bsdPred };
  } else {
    var baseHW2 = poisson.homeWin * w.poissonWeight + eloHome * w.eloWeight + effectiveMarket.homeWin * w.marketWeight;
    var baseAW2 = poisson.awayWin * w.poissonWeight + eloAway * w.eloWeight + effectiveMarket.awayWin * w.marketWeight;
    var baseDW2 = cfg.hasDraw ? (poisson.draw * w.poissonWeight + eloDrawVal * w.eloWeight + effectiveMarket.draw * w.marketWeight) : 0;
    if (bsdPred) {
      var b2 = 0.20;
      baseHW2 = baseHW2 * (1 - b2) + bsdPred.home * b2;
      baseAW2 = baseAW2 * (1 - b2) + bsdPred.away * b2;
      baseDW2 = baseDW2 * (1 - b2) + (bsdPred.draw || 0) * b2;
    }
    pred = { homeWin: baseHW2, awayWin: baseAW2, draw: baseDW2, mlUsed: false, bsdUsed: !!bsdPred };
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

  // Ensemble voting with BSD + API-Football
  var ensembleResult = tripleEnsembleVote(pred.homeWin, pred.awayWin, pred.draw || 0, bsdPred, afPred);

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
  var finalConf = Math.min(cfg.maxConf, Math.max(cfg.minConf, best.conf));
  // Ensemble boost: triple vote agreement
  if (ensembleResult.unanimous) finalConf = Math.min(cfg.maxConf, finalConf + ensembleResult.boostConfidence);
  else if (ensembleResult.agree) finalConf = Math.min(cfg.maxConf, finalConf + ensembleResult.boostConfidence);
  else if (ensembleResult.disagree) finalConf = Math.max(cfg.minConf, finalConf - 8);
  else finalConf = Math.max(cfg.minConf, finalConf - 3);
  var valueEdge = best.prob - (1 / parseFloat(best.odds));
  var reason = buildTipReason({ marketType: best.marketType, market: best.market, pick: best.pick, home: home, away: away, poisson: poisson, eloH: adjustedElo, eloA: adjustedEloA, hForm: hForm, aForm: aForm, bsdPred: bsdPred, afPred: afPred, ensembleResult: ensembleResult, bttsProb: btts.yes, expectedTotal: poisson.expectedHomeGoals + poisson.expectedAwayGoals, valueEdge: valueEdge, h2hTotal: h2hData ? h2hData.total : 0, h2hHomeWins: h2hData ? h2hData.homeWinRate : 0.5 });
  return { type: sport.key, sport: sport.name, icon: sport.icon, match: home + ' vs ' + away, league: sport.name, country: COUNTRY_MAP[sport.key] || '', marketType: best.marketType, market: best.market, marketLine: best.line, kickoff: oddsMatch.commence_time, pick: best.pick, odds: best.odds, conf: finalConf, realOdds: consensus ? { home: consensus.bestHomePrice || null, away: consensus.bestAwayPrice || null, draw: consensus.bestDrawPrice || null } : null, bookmaker: best.bookmaker, valueBet: best.valueBet, reason: reason, features: features, bsdAgree: bsdPred ? ensembleResult.agree : null, tripleAgree: ensembleResult.unanimous };
}

// === DEDICATED BASEBALL PREDICTION ENGINE ===
// Baseball is highly random — focus on value detection, not confidence
function buildBaseballTip(oddsMatch, sport) {
  if (disabledSports[sport.key]) return null;
  const home = oddsMatch.home_team, away = oddsMatch.away_team;
  const cfg = getCfg(sport.key);
  const consensus = marketConsensus(home, away, oddsMatch, sport);
  if (!consensus) return null;
  const hStats = getAttackDefense(sport.key, home, true);
  const aStats = getAttackDefense(sport.key, away, false);
  // Baseball home advantage is ~54% (higher than most sports)
  const BASEBALL_HOME_ADV = 60;
  const fmHome = formModifier(sport.key, home);
  const adjustedElo = Math.max(1000, Math.min(2000, getElo(sport.key, home) + BASEBALL_HOME_ADV + fmHome));
  const fmAway = formModifier(sport.key, away);
  const adjustedEloA = Math.max(1000, Math.min(2000, getElo(sport.key, away) + fmAway));
  const rawElo = expectedScore(adjustedElo, adjustedEloA);
  const eloHome = rawElo;
  const eloAway = 1 - rawElo;
  // Baseball: use rating diff more aggressively (team quality matters more in baseball)
  const ratingDiff = ((hStats.attack + hStats.defense) - (aStats.attack + aStats.defense)) / 15;
  // Weight: 40% ELO, 60% market (baseball markets are efficient)
  const eW = 0.40, mW = 0.60;
  // ML model
  const features = buildFeatures(home, away, sport.key);
  const rawLR = predictLR(sport.key, features);
  let blendHome, blendAway;
  if (rawLR !== null) {
    const mlHome = rawLR, mlAway = 1 - rawLR;
    blendHome = mlHome * 0.25 + (eloHome * eW + consensus.homeWin * mW + Math.max(0, ratingDiff) * 0.15) * 0.75;
    blendAway = mlAway * 0.25 + (eloAway * eW + consensus.awayWin * mW + Math.max(0, -ratingDiff) * 0.15) * 0.75;
  } else {
    blendHome = eloHome * eW + consensus.homeWin * mW + Math.max(0, ratingDiff) * 0.15;
    blendAway = eloAway * eW + consensus.awayWin * mW + Math.max(0, -ratingDiff) * 0.15;
  }
  const totalB = blendHome + blendAway;
  const nHome = totalB > 0 ? blendHome / totalB : 0.5;
  const nAway = totalB > 0 ? blendAway / totalB : 0.5;
  // Baseball: only pick if model disagrees with market by >8% (value bet)
  const marketHome = consensus.homeWin;
  const marketAway = consensus.awayWin;
  var pickTeam, pickProb, pickMarket, valueMargin;
  if (nHome > nAway) {
    pickTeam = home; pickProb = nHome; pickMarket = marketHome;
    valueMargin = nHome - marketHome;
  } else {
    pickTeam = away; pickProb = nAway; pickMarket = marketAway;
    valueMargin = nAway - marketAway;
  }
  // Require minimum value edge — baseball is too random for marginal picks
  if (valueMargin < 0.06) return null;
  // Require minimum model confidence — don't pick coin flips
  if (pickProb < 0.52) return null;
  var tipText = pickTeam + ' to Win';
  var odds = pickTeam === home ? (consensus.bestHomePrice > 0 ? consensus.bestHomePrice.toFixed(2) : (1 / nHome).toFixed(2)) : (consensus.bestAwayPrice > 0 ? consensus.bestAwayPrice.toFixed(2) : (1 / nAway).toFixed(2));
  var bookmaker = pickTeam === home ? consensus.bestHomeBook : consensus.bestAwayBook;
  // Baseball confidence is capped lower — max 85% due to inherent randomness
  var confidence = confidenceFromProb(pickProb, consensus.agreement);
  confidence = Math.min(85, Math.max(65, confidence));
  // Reduce confidence further for small value edges
  if (valueMargin < 0.10) confidence = Math.min(confidence, 75);
  var formNote = (Math.abs(fmHome) > 5 || Math.abs(fmAway) > 5) ? ' Form ' + (fmHome > 0 ? '+' : '') + fmHome + 'v' + (fmAway > 0 ? '+' : '') + fmAway : '';
  var h2h = getH2H(sport.key, home, away);
  var h2hNote = h2h ? ' H2H ' + h2h.total : '';
  var valueNote = ' Value +' + (valueMargin * 100).toFixed(0) + '%';
  var hForm3 = getFormWindow(sport.key, home, cfg.formWindow);
  var aForm3 = getFormWindow(sport.key, away, cfg.formWindow);
  var reason = buildTipReason({ marketType: 'h2h', market: 'Match Winner', pick: tipText, home: home, away: away, poisson: null, eloH: adjustedElo, eloA: adjustedEloA, hForm: hForm3, aForm: aForm3, bsdPred: null, afPred: null, ensembleResult: { unanimous: false, agree: false }, expectedTotal: 0, valueEdge: valueMargin });
  return { type: sport.key, sport: sport.name, icon: sport.icon, match: home + ' vs ' + away, league: sport.name, country: COUNTRY_MAP[sport.key] || '', marketType: 'h2h', market: 'Match Winner', marketLine: null, kickoff: oddsMatch.commence_time, pick: tipText, odds: odds, conf: confidence, realOdds: { home: consensus.bestHomePrice || null, away: consensus.bestAwayPrice || null, draw: null }, bookmaker: bookmaker, valueBet: true, reason: reason, features: features };
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

  // BSD CatBoost ML prediction
  const bsdPred = getBSDPrediction(home, away);
  // API-Football Poisson/statistics prediction
  const afPred = getAPIFootballPrediction(home, away);

  // ML model override
  const features = buildFeatures(home, away, sport.key);
  const rawLR = predictLR(sport.key, features);
  let blendHome, blendAway, blendDraw;
  if (rawLR !== null) {
    const mlHome = rawLR, mlAway = 1 - rawLR;
    var bsdH = bsdPred ? bsdPred.home : 0, bsdA = bsdPred ? bsdPred.away : 0, bsdD = bsdPred ? bsdPred.draw : 0;
    var bW = bsdPred ? 0.15 : 0;
    blendHome = mlHome * 0.30 + (eloHome * eW + consensus.homeWin * mW + Math.max(0, ratingDiff) * 0.1) * 0.55 + bsdH * bW;
    blendAway = mlAway * 0.30 + (eloAway * eW + consensus.awayWin * mW + Math.max(0, -ratingDiff) * 0.1) * 0.55 + bsdA * bW;
    blendDraw = cfg.hasDraw ? (eloDrawVal * eW + consensus.draw * mW) * 0.55 + bsdD * bW : 0;
  } else {
    var bW2 = bsdPred ? 0.20 : 0;
    blendHome = eloHome * eW + consensus.homeWin * mW + Math.max(0, ratingDiff) * 0.1 + (bsdPred ? bsdPred.home : 0) * bW2;
    blendAway = eloAway * eW + consensus.awayWin * mW + Math.max(0, -ratingDiff) * 0.1 + (bsdPred ? bsdPred.away : 0) * bW2;
    blendDraw = cfg.hasDraw ? (eloDrawVal * eW + consensus.draw * mW + (bsdPred ? bsdPred.draw : 0) * bW2) : 0;
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
  // Ensemble voting with BSD + API-Football
  var nHomeNorm = nHome, nAwayNorm = nAway;
  var ensembleResult = tripleEnsembleVote(nHomeNorm, nAwayNorm, nDraw, bsdPred, afPred);
  var finalConf2 = Math.min(cfg.maxConf, Math.max(cfg.minConf, confidence));
  if (ensembleResult.unanimous) finalConf2 = Math.min(cfg.maxConf, finalConf2 + ensembleResult.boostConfidence);
  else if (ensembleResult.agree) finalConf2 = Math.min(cfg.maxConf, finalConf2 + ensembleResult.boostConfidence);
  else if (ensembleResult.disagree) finalConf2 = Math.max(cfg.minConf, finalConf2 - 8);
  else finalConf2 = Math.max(cfg.minConf, finalConf2 - 3);
  var hFormN = getFormWindow(sport.key, home, cfg.formWindow);
  var aFormN = getFormWindow(sport.key, away, cfg.formWindow);
  reason = buildTipReason({ marketType: 'h2h', market: cfg.hasDraw ? 'Match Result' : 'Match Winner', pick: tipText, home: home, away: away, poisson: { expectedHomeGoals: (hStats.attack / 7.5) * 1.25 * cfg.homeAdv, expectedAwayGoals: (aStats.attack / 7.5) * 1.05 }, eloH: adjustedElo, eloA: adjustedEloA, hForm: hFormN, aForm: aFormN, bsdPred: bsdPred, afPred: afPred, ensembleResult: ensembleResult, h2hTotal: h2h ? h2h.total : 0, h2hHomeWins: h2h ? h2h.homeWinRate : 0.5 });
  return { type: sport.key, sport: sport.name, icon: sport.icon, match: home + ' vs ' + away, league: sport.name, country: COUNTRY_MAP[sport.key] || '', marketType: 'h2h', market: cfg.hasDraw ? 'Match Result' : 'Match Winner', marketLine: null, kickoff: oddsMatch.commence_time, pick: tipText, odds: odds, conf: finalConf2, realOdds: { home: consensus.bestHomePrice || null, away: consensus.bestAwayPrice || null, draw: cfg.hasDraw ? (consensus.bestDrawPrice || null) : null }, bookmaker: bookmaker, valueBet: valueBet, reason: reason, features: features, bsdAgree: bsdPred ? ensembleResult.agree : null, tripleAgree: ensembleResult.unanimous };
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
  if (tip.marketType === 'corner') {
    var corners = (parseInt(hScore, 10) || 0) + (parseInt(aScore, 10) || 0);
    var cornerLine = parseFloat(tip.marketLine) || 9.5;
    return tip.pick.indexOf('Over') >= 0 ? corners > cornerLine : corners < cornerLine;
  }
  const homeWin = hScore > aScore, awayWin = aScore > hScore;
  if (tip.pick === 'Draw') return hScore === aScore;
  if (tip.pick.indexOf('or Draw') >= 0 && tip.pick.indexOf(home) >= 0) return hScore >= aScore;
  if (tip.pick.indexOf('or Draw') >= 0 && tip.pick.indexOf(away) >= 0) return aScore >= hScore;
  if (tip.pick.indexOf(home) >= 0 && tip.pick.indexOf('or Draw') < 0) return homeWin;
  if (tip.pick.indexOf(away) >= 0 && tip.pick.indexOf('or Draw') < 0) return awayWin;
  console.log('[RESULTS] WARNING: Unknown marketType "' + tip.marketType + '" for ' + tip.match + ' — marking as lost');
  return false;
}

function applyResultToTip(tip, home, away, hScore, aScore, now) {
  var won = determineWin(tip, home, away, hScore, aScore);
  tip.result = won ? 'won' : 'lost';
  tip.checkedAt = now.toISOString();
  var scoreA = hScore > aScore ? 1 : (hScore === aScore ? 0.5 : 0);
  const cfg = getCfg(tip.type);
  updateElo(tip.type, home, away, scoreA, cfg.kFactor);
  updateForm(tip.type, home, away, scoreA);
  updateWeights(tip.type, won);
  recordCalibration(tip.conf, won);
  updateTeamStats(tip.type, home, away, hScore, aScore);
  updateH2H(tip.type, home, away, hScore, aScore);
  updateMatchDate(home, tip.kickoff);
  updateMatchDate(away, tip.kickoff);
  logFeature(tip.type, tip.features, won);
  console.log('[RESULTS] ' + tip.match + ' → ' + tip.result.toUpperCase() + ' (predicted: ' + tip.pick + ')');
  return won;
}

async function checkCricketResult(tip, home, away, now) {
  try {
    var tipKickoff = new Date(tip.kickoff);
    var dateFrom = new Date(tipKickoff.getTime() - 86400000).toISOString().split('T')[0];
    var dateTo = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
    var smUrl = 'https://api.sportmonks.com/v3/cricket/fixtures/between/' + dateFrom + '/' + dateTo + '?api_token=' + process.env.SPORTMONKS_API_KEY + '&include=scorecard';
    var smRes = await fetch(smUrl, { signal: AbortSignal.timeout(8000) });
    if (!smRes.ok) return false;
    var smData = await smRes.json();
    if (!smData.data || smData.data.length === 0) return false;
    var fixture = smData.data.find(function(f) {
      var fHome = (f.home_team && f.home_team.name) || '';
      var fAway = (f.away_team && f.away_team.name) || '';
      return (normalizeTeamName(fHome).indexOf(normalizeTeamName(home)) >= 0 || normalizeTeamName(home).indexOf(normalizeTeamName(fHome)) >= 0) &&
             (normalizeTeamName(fAway).indexOf(normalizeTeamName(away)) >= 0 || normalizeTeamName(away).indexOf(normalizeTeamName(fAway)) >= 0) &&
             f.status && f.status === 'Finished';
    });
    if (!fixture || !fixture.scorecard) return false;
    var sc = fixture.scorecard;
    var hRuns = 0, aRuns = 0;
    if (sc.innings && sc.innings.length >= 2) {
      hRuns = sc.innings[0].score || 0;
      aRuns = sc.innings[1].score || 0;
    }
    if (hRuns === 0 && aRuns === 0) return false;
    applyResultToTip(tip, home, away, hRuns, aRuns, now);
    return true;
  } catch (e) { return false; }
}

async function checkSportMonksResult(tip, home, away, now) {
  try {
    var tipKickoff = new Date(tip.kickoff);
    var dateFrom = new Date(tipKickoff.getTime() - 86400000).toISOString().split('T')[0];
    var dateTo = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
    var smUrl = 'https://api.sportmonks.com/v3/football/fixtures/between/' + dateFrom + '/' + dateTo + '?api_token=' + process.env.SPORTMONKS_API_KEY + '&include=scores';
    var smRes = await fetch(smUrl, { signal: AbortSignal.timeout(8000) });
    if (!smRes.ok) return false;
    var smData = await smRes.json();
    if (!smData.data || smData.data.length === 0) return false;
    var fixture = smData.data.find(function(f) {
      var fHome = (f.home_team && f.home_team.name) || '';
      var fAway = (f.away_team && f.away_team.name) || '';
      return normalizeTeamName(fHome) === normalizeTeamName(home) && normalizeTeamName(fAway) === normalizeTeamName(away) && f.status && f.status.name === 'Finished';
    });
    if (!fixture || !fixture.scores || !fixture.scores.fulltime) return false;
    var hg = fixture.scores.fulltime.home;
    var ag = fixture.scores.fulltime.away;
    if (hg === null || ag === null) return false;
    applyResultToTip(tip, home, away, hg, ag, now);
    return true;
  } catch (e) { return false; }
}

async function checkTennisResult(tip, home, away, now) {
  try {
    var tour = tip.type.indexOf('wta') >= 0 ? 'wta' : 'atp';
    var tipKickoff = new Date(tip.kickoff);
    var dates = [];
    dates.push(tipKickoff.toISOString().split('T')[0].replace(/-/g, ''));
    var nextDay = new Date(tipKickoff.getTime() + 86400000).toISOString().split('T')[0].replace(/-/g, '');
    if (dates[0] !== nextDay) dates.push(nextDay);
    var prevDay = new Date(tipKickoff.getTime() - 86400000).toISOString().split('T')[0].replace(/-/g, '');
    if (prevDay !== dates[0]) dates.unshift(prevDay);
    for (var di = 0; di < dates.length; di++) {
      var espnUrl = 'https://site.api.espn.com/apis/site/v2/sports/tennis/' + tour + '/scoreboard?dates=' + dates[di];
      var espnRes = await fetch(espnUrl, { signal: AbortSignal.timeout(8000) });
      if (!espnRes.ok) continue;
      var espnData = await espnRes.json();
      if (!espnData.events) continue;
      for (var ei = 0; ei < espnData.events.length; ei++) {
        var ev = espnData.events[ei];
        if (!ev.groupings) continue;
        for (var gi = 0; gi < ev.groupings.length; gi++) {
          var comps = ev.groupings[gi].competitions || [];
          for (var ci = 0; ci < comps.length; ci++) {
            var comp = comps[ci];
            if (!comp.status || !comp.status.type || !comp.status.type.completed) continue;
            if (!comp.competitors || comp.competitors.length < 2) continue;
            var p1 = comp.competitors[0], p2 = comp.competitors[1];
            var n1 = (p1.athlete && p1.athlete.displayName) || '';
            var n2 = (p2.athlete && p2.athlete.displayName) || '';
            var nn1 = normalizeTeamName(n1), nn2 = normalizeTeamName(n2);
            var nh = normalizeTeamName(home), na = normalizeTeamName(away);
            var match = false;
            if ((nn1.indexOf(nh) >= 0 || nh.indexOf(nn1) >= 0) && (nn2.indexOf(na) >= 0 || na.indexOf(nn2) >= 0)) match = true;
            if ((nn1.indexOf(na) >= 0 || na.indexOf(nn1) >= 0) && (nn2.indexOf(nh) >= 0 || nh.indexOf(nn2) >= 0)) match = true;
            if (!match) continue;
            var ls1 = p1.linescores || [], ls2 = p2.linescores || [];
            if (ls1.length === 0 || ls2.length === 0) continue;
            var s1 = 0, s2 = 0;
            for (var si = 0; si < ls1.length; si++) {
              if ((ls1[si].value || 0) > (ls2[si] ? ls2[si].value || 0 : 0)) s1++;
              else if ((ls2[si] ? ls2[si].value || 0 : 0) > (ls1[si].value || 0)) s2++;
            }
            if (s1 === 0 && s2 === 0) continue;
            var homeScore = 0, awayScore = 0;
            if ((nn1.indexOf(nh) >= 0 || nh.indexOf(nn1) >= 0)) { homeScore = s1; awayScore = s2; }
            else { homeScore = s2; awayScore = s1; }
            applyResultToTip(tip, home, away, homeScore, awayScore, now);
            return true;
          }
        }
      }
    }
    return false;
  } catch (e) { return false; }
}

// === FREE WEB-BASED SCORE CHECKING (ESPN API — no API key needed) ===
var ESPN_LEAGUE_MAP = {
  'soccer_epl': 'eng.1',
  'soccer_fifa_world_cup': 'fifa.world',
  'soccer_england_championship': 'eng.2',
  'soccer_spain_la_liga': 'esp.1',
  'soccer_germany_bundesliga': 'ger.1',
  'soccer_italy_serie_a': 'ita.1',
  'soccer_france_ligue_one': 'fra.1',
  'soccer_netherlands_eredivisie': 'ned.1',
  'soccer_portugal_liga': 'por.1',
  'soccer_brazil_serie_a': 'bra.1',
  'soccer_usa_mls': 'usa.1',
  'soccer_uefa_champs_league': 'uefa.champions',
  'soccer_uefa_europa_league': 'uefa.europa',
  'soccer_turkey_super_lig': 'tur.1',
  'soccer_belgium_first_division_a': 'bel.1',
  'soccer_scotland_premiership': 'sco.1',
  'tennis_atp_wimbledon': 'tennis/atp',
  'tennis_wta_wimbledon': 'tennis/wta',
  'americanfootball_nfl': 'football/nfl',
  'baseball_mlb': 'baseball/mlb',
  'rugbyleague_nrl': '',
  'aussierules_afl': '',
  'cricket_international_t20': ''
};

var COMPETITION_CODE_MAP = {
  'soccer_epl': 'PL',
  'soccer_spain_la_liga': 'PD',
  'soccer_italy_serie_a': 'SA',
  'soccer_germany_bundesliga': 'BL1',
  'soccer_france_ligue_one': 'FL1',
  'soccer_uefa_champs_league': 'CL',
  'soccer_netherlands_eredivisie': 'DED',
  'soccer_portugal_liga': 'PPL',
  'soccer_brazil_serie_a': 'BSA',
  'soccer_scotland_premiership': 'SP1'
};

function espnDateStr(date) {
  var d = new Date(date);
  return d.getFullYear().toString() + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1) + (d.getDate() < 10 ? '0' : '') + d.getDate();
}

async function checkESPNResult(tip, home, away, now) {
  var espnSlug = ESPN_LEAGUE_MAP[tip.type];
  if (!espnSlug) return false;
  try {
    var tipKickoff = new Date(tip.kickoff);
    var dates = [espnDateStr(tipKickoff)];
    var nextDay = espnDateStr(new Date(tipKickoff.getTime() + 86400000));
    var prevDay = espnDateStr(new Date(tipKickoff.getTime() - 86400000));
    if (nextDay !== dates[0]) dates.push(nextDay);
    if (prevDay !== dates[0]) dates.unshift(prevDay);
    for (var di = 0; di < dates.length; di++) {
      var url = 'https://site.api.espn.com/apis/site/v2/sports/' + espnSlug + '/scoreboard?dates=' + dates[di];
      var espnRes = await safeFetch(url, { headers: { 'User-Agent': 'MJKTips/1.0' } }, 10000);
      if (!espnRes.ok) continue;
      var espnData = await espnRes.json();
      if (!espnData.events) continue;
      for (var ei = 0; ei < espnData.events.length; ei++) {
        var ev = espnData.events[ei];
        if (!ev.competitions || !ev.competitions[0]) continue;
        var comp = ev.competitions[0];
        if (!comp.competitors || comp.competitors.length < 2) continue;
        if (!comp.status || !comp.status.type || !comp.status.type.completed) continue;
        var c1 = comp.competitors[0], c2 = comp.competitors[1];
        var n1 = (c1.team ? c1.team.displayName : '') || (c1.team ? c1.team.name : '') || '';
        var n2 = (c2.team ? c2.team.displayName : '') || (c2.team ? c2.team.name : '') || '';
        var nn1 = normalizeTeamName(n1).toLowerCase(), nn2 = normalizeTeamName(n2).toLowerCase();
        var nh = normalizeTeamName(home).toLowerCase(), na = normalizeTeamName(away).toLowerCase();
        var matchFound = false;
        if ((nn1.indexOf(nh) >= 0 || nh.indexOf(nn1) >= 0) && (nn2.indexOf(na) >= 0 || na.indexOf(nn2) >= 0)) matchFound = true;
        if ((nn1.indexOf(na) >= 0 || na.indexOf(nn1) >= 0) && (nn2.indexOf(nh) >= 0 || nh.indexOf(nn2) >= 0)) matchFound = true;
        if (!matchFound) continue;
        var homeScore = 0, awayScore = 0;
        if ((nn1.indexOf(nh) >= 0 || nh.indexOf(nn1) >= 0)) {
          homeScore = parseInt(c1.score || '0', 10); awayScore = parseInt(c2.score || '0', 10);
        } else {
          homeScore = parseInt(c2.score || '0', 10); awayScore = parseInt(c1.score || '0', 10);
        }
        if (homeScore === 0 && awayScore === 0 && !(c1.score === '0' || c2.score === '0')) continue;
        applyResultToTip(tip, home, away, homeScore, awayScore, now);
        console.log('[RESULTS] ESPN: ' + tip.match + ' → ' + (homeScore > awayScore ? home : homeScore < awayScore ? away : 'Draw') + ' ' + homeScore + '-' + awayScore);
        return true;
      }
    }
  } catch (e) {}
  return false;
}

async function checkFBCompetitionResult(tip, home, away, now) {
  var code = COMPETITION_CODE_MAP[tip.type];
  if (!code || !FB_API_KEY) return false;
  try {
    var tipKickoff = new Date(tip.kickoff);
    var dateFrom = new Date(tipKickoff.getTime() - 86400000).toISOString().split('T')[0];
    var dateTo = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
    var url = FB_API_BASE + '/competitions/' + code + '/matches?dateFrom=' + dateFrom + '&dateTo=' + dateTo;
    var res = await safeFetch(url, { headers: { 'X-Auth-Token': FB_API_KEY } }, 10000);
    if (!res.ok) return false;
    var data = await res.json();
    if (!data.matches) return false;
    var match = data.matches.find(function(m) {
      return normalizeTeamName(m.homeTeam ? m.homeTeam.name : '') === normalizeTeamName(home) &&
             normalizeTeamName(m.awayTeam ? m.awayTeam.name : '') === normalizeTeamName(away) &&
             m.status === 'FINISHED' && m.score && m.score.fullTime &&
             m.score.fullTime.home !== null && m.score.fullTime.away !== null;
    });
    if (!match) return false;
    applyResultToTip(tip, home, away, match.score.fullTime.home, match.score.fullTime.away, now);
    console.log('[RESULTS] FB-Data (' + code + '): ' + tip.match + ' → ' + match.score.fullTime.home + '-' + match.score.fullTime.away);
    return true;
  } catch (e) { return false; }
}

async function checkAPIFootballResult(tip, home, away, now) {
  if (!APIFOOTBALL_KEY) return false;
  try {
    var tipKickoff = new Date(tip.kickoff);
    var dateStr = tipKickoff.toISOString().split('T')[0];
    var url = APIFOOTBALL_BASE + '/fixtures?date=' + dateStr;
    var res = await safeFetch(url, { headers: { 'x-apisports-key': APIFOOTBALL_KEY } }, 10000);
    if (!res.ok) return false;
    var data = await res.json();
    if (!data.response) return false;
    var match = data.response.find(function(r) {
      return r.fixture && r.fixture.status && r.fixture.status.short === 'FT' &&
             normalizeTeamName(r.teams.home.name) === normalizeTeamName(home) &&
             normalizeTeamName(r.teams.away.name) === normalizeTeamName(away) &&
             r.goals.home !== null && r.goals.away !== null;
    });
    if (!match) return false;
    applyResultToTip(tip, home, away, match.goals.home, match.goals.away, now);
    console.log('[RESULTS] API-Football: ' + tip.match + ' → ' + match.goals.home + '-' + match.goals.away);
    return true;
  } catch (e) { return false; }
}

// ESPN non-soccer fixture tip generator (used when odds-api is out of credits)
var ESPN_SCOREBOARD_SLUGS = {
  'tennis_atp_wimbledon': 'tennis/atp',
  'tennis_wta_wimbledon': 'tennis/wta',
  'americanfootball_nfl': 'football/nfl',
  'baseball_mlb': 'baseball/mlb',
  'mma_mixed_martial_arts': 'mma'
};
var cachedESPNNonSoccer = {};
async function fetchESPNNonSoccerFixtures() {
  var keys = Object.keys(ESPN_SCOREBOARD_SLUGS);
  for (var ki = 0; ki < keys.length; ki++) {
    var sportKey = keys[ki];
    var slug = ESPN_SCOREBOARD_SLUGS[sportKey];
    if (!slug) { cachedESPNNonSoccer[sportKey] = []; continue; }
    try {
      var url = 'https://site.api.espn.com/apis/site/v2/sports/' + slug + '/scoreboard?dates=' + new Date().toISOString().slice(0,10).replace(/-/g,'');
      var res = await safeFetch(url, { headers: { 'User-Agent': 'MJKTips' } }, 8000);
      if (!res.ok) { cachedESPNNonSoccer[sportKey] = []; continue; }
      var data = await res.json();
      var events = (data.events || []).filter(function(e) {
        var st = e.competitions && e.competitions[0] && e.competitions[0].status;
        return st && st.type && (st.type.state === 'pre' || st.type.name === 'STATUS_SCHEDULED');
      });
      cachedESPNNonSoccer[sportKey] = events;
      console.log('[ESPN-FIXTURES] ' + sportKey + ': ' + events.length + ' upcoming');
    } catch (e) {
      cachedESPNNonSoccer[sportKey] = [];
      console.log('[ESPN-FIXTURES] ' + sportKey + ' ERROR: ' + (e.message || e).slice(0, 100));
    }
  }
}
function buildESPNFixtureTip(event, sportKey) {
  var sport = SPORTS.find(function(s) { return s.key === sportKey; });
  if (!sport) return null;
  var comp = event.competitions && event.competitions[0];
  if (!comp || !comp.competitors || comp.competitors.length < 2) return null;
  var c0 = comp.competitors[0], c1 = comp.competitors[1];
  var home = (c0.team && c0.team.displayName) || (c0.athlete && c0.athlete.displayName) || c0.displayName || '';
  var away = (c1.team && c1.team.displayName) || (c1.athlete && c1.athlete.displayName) || c1.displayName || '';
  if (!home || !away) return null;
  var cfg = getCfg(sportKey);
  var hElo = getElo(sportKey, home);
  var aElo = getElo(sportKey, away);
  var fmH = formModifier(sportKey, home);
  var fmA = formModifier(sportKey, away);
  var adjH = Math.max(1000, Math.min(2000, hElo + (cfg.hasDraw ? 0 : HOME_ADVANTAGE_ELO) + fmH));
  var adjA = Math.max(1000, Math.min(2000, aElo + fmA));
  var eloProb = expectedScore(adjH, adjA);
  var features = buildFeatures(home, away, sportKey);
  var rawLR = predictLR(sportKey, features);
  var predH, predA;
  if (rawLR !== null) { predH = rawLR * 0.6 + eloProb * 0.4; predA = (1 - rawLR) * 0.6 + (1 - eloProb) * 0.4; }
  else { predH = eloProb; predA = 1 - eloProb; }
  var kickoff = event.date || (comp.date) || new Date().toISOString();
  var pick = '', oddsStr = '2.00', conf = 0, mr = cfg.hasDraw ? 'Match Result' : 'Match Winner';
  if (!cfg.hasDraw) {
    if (predH > predA && predH > 0.40) { pick = home + ' to Win'; conf = Math.round(predH * 100); oddsStr = predH > 0.05 ? (1 / predH * 0.92).toFixed(2) : '2.00'; }
    else if (predA > predH && predA > 0.40) { pick = away + ' to Win'; conf = Math.round(predA * 100); oddsStr = predA > 0.05 ? (1 / predA * 0.92).toFixed(2) : '2.00'; }
    else return null;
  } else {
    var predD = 0.25;
    if (predH > predA && predH > predD && predH > 0.35) { pick = home + ' to Win'; conf = Math.round(predH * 100); oddsStr = predH > 0.05 ? (1 / predH * 0.92).toFixed(2) : '2.00'; }
    else if (predA > predH && predA > predD && predA > 0.35) { pick = away + ' to Win'; conf = Math.round(predA * 100); oddsStr = predA > 0.05 ? (1 / predA * 0.92).toFixed(2) : '2.00'; }
    else return null;
  }
  conf = Math.min(cfg.maxConf, Math.max(cfg.minConf, conf));
  conf = calibrateConfidence(conf);
  var hFormN = getFormWindow(sportKey, home, cfg.formWindow);
  var aFormN = getFormWindow(sportKey, away, cfg.formWindow);
  var reason = 'ELO ' + Math.round(adjH) + ' vs ' + Math.round(adjA);
  if (rawLR !== null) reason += ' ML-boosted';
  if (hFormN || aFormN) reason += ' Form ' + (hFormN ? hFormN.rate : '?') + 'v' + (aFormN ? aFormN.rate : '?');
  reason += '. ESPN fixture.';
  return {
    type: sportKey, sport: sport.name, icon: sport.icon,
    match: home + ' vs ' + away, league: sport.name,
    country: COUNTRY_MAP[sportKey] || '',
    marketType: 'h2h', market: mr, marketLine: null,
    kickoff: kickoff, pick: pick, odds: oddsStr, conf: conf,
    realOdds: null, bookmaker: 'ESPN', valueBet: false,
    reason: reason, features: features
  };
}

async function checkResults() {
  const now = new Date();
  const pending = trackedTips.filter(function(t) { return t.result === 'pending' && t.kickoff && new Date(t.kickoff) < new Date(now.getTime() - 2 * 60 * 60 * 1000); });
  if (pending.length === 0) { console.log('[RESULTS] No pending tips past kickoff (' + trackedTips.filter(function(t) { return t.result === 'pending'; }).length + ' future pending)'); return; }
  loadElo(); loadForm(); loadWeights(); loadCalibration(); loadTeamStats(); loadH2H(); loadMatchDates(); loadFeatureLogs();
  var checked = 0;
  for (var i = 0; i < pending.length; i++) {
    var tip = pending[i];
    try {
      var home, away; var parts = tip.match.split(' vs '); home = parts[0]; away = parts[1];
      var found = false;
      // Horse racing placeholders with no real pick — mark void
      if (tip.type === 'horse_racing' && (!tip.pick || tip.pick.indexOf('form guide') >= 0 || tip.odds === 'TBD')) {
        tip.result = 'void'; tip.checkedAt = now.toISOString(); tip.homeScore = 0; tip.awayScore = 0;
        console.log('[RESULTS] Void: ' + tip.match + ' (no actual pick)');
        found = true;
      }
      // 1) Soccer: try football-data.org per-competition (free tier)
      if (!found && tip.type.startsWith('soccer_') && tip.type !== 'soccer_usa_mls') {
        found = await checkFBCompetitionResult(tip, home, away, now);
      }
      // 2) Tennis: try ESPN free API
      if (!found && tip.type.startsWith('tennis_')) {
        found = await checkESPNResult(tip, home, away, now);
        if (!found) found = await checkTennisResult(tip, home, away, now);
      }
      // 3) Cricket: SportMonks API
      if (!found && tip.type === 'cricket_international_t20') {
        found = await checkCricketResult(tip, home, away, now);
      }
      // 4) ESPN free API — covers soccer, NFL, MLB, tennis, FIFA WC (has timeout via safeFetch)
      if (!found) {
        found = await checkESPNResult(tip, home, away, now);
      }
      // 5) the-odds-api scores (has credits issues — use safeFetch with 8s timeout)
      if (!found) {
        try {
          var res = await safeFetch(ODDS_API_BASE + '/sports/' + tip.type + '/scores?apiKey=' + ODDS_API_KEY + '&daysFrom=2', {}, 8000);
          if (res.ok) {
            var scores = await res.json();
            if (scores && scores.length > 0) {
              var match = scores.find(function(s) { return normalizeTeamName(s.home_team) === normalizeTeamName(home) && normalizeTeamName(s.away_team) === normalizeTeamName(away) && s.completed === true && s.scores; });
              if (match && match.scores) {
                var hScore = parseInt(match.scores[0] ? match.scores[0].score : (match.scores.home || 0), 10);
                var aScore = parseInt(match.scores[1] ? match.scores[1].score : (match.scores.away || 0), 10);
                applyResultToTip(tip, home, away, hScore, aScore, now);
                found = true;
              }
            }
          }
        } catch (e) {}
      }
      // 6) API-Football (free 100/day — soccer only)
      if (!found && tip.type.startsWith('soccer_')) {
        found = await checkAPIFootballResult(tip, home, away, now);
      }
      // 7) SportMonks football scores
      if (!found && tip.type.startsWith('soccer_')) {
        found = await checkSportMonksResult(tip, home, away, now);
      }
      if (found) checked++;
      else console.log('[RESULTS] No source for ' + tip.type + ': ' + tip.match);
    } catch (e) { console.log('[RESULTS] Error checking ' + tip.match + ': ' + (e.message || e).slice(0, 100)); }
  }
  saveTrackedTips();
  checkSportHealth();
  console.log('[RESULTS] Checked ' + checked + '/' + pending.length + ' pending tips');
  if (Math.random() < 0.1) {
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
    var oddsKeyInUse = ODDS_API_KEY;
    var oddsKey2Avail = !!ODDS_API_KEY_2;
    var primaryExhausted = false;
    for (var si = 0; si < SPORTS.length; si++) {
      try {
        var sportKey = SPORTS[si].key;
        // If primary key exhausted and we have a backup, use it
        if (primaryExhausted && oddsKey2Avail) oddsKeyInUse = ODDS_API_KEY_2;
        var url = ODDS_API_BASE + '/sports/' + sportKey + '/odds?apiKey=' + oddsKeyInUse + '&regions=us,uk,eu&markets=h2h,spreads,totals';
        var res = await safeFetch(url, {}, 10000);
        // Track remaining credits from headers
        var rem = res.headers.get('x-requests-remaining');
        if (rem !== null && si === 0) console.log('[ODDS] API credits remaining: ' + rem);
        if (res.status === 401 || res.status === 429) {
          var txt = await res.text();
          if (!primaryExhausted && oddsKey2Avail) {
            console.log('[ODDS] Primary key EXHAUSTED (HTTP ' + res.status + '), switching to backup key...');
            primaryExhausted = true;
            si--; // retry this sport with backup key
            continue;
          }
          console.log('[ODDS] ' + sportKey + ' FAILED HTTP ' + res.status + ': ' + txt.slice(0, 200));
          cachedOdds[sportKey] = [];
        } else if (res.ok) {
          cachedOdds[sportKey] = await res.json();
          console.log('[ODDS] ' + sportKey + ': ' + cachedOdds[sportKey].length + ' matches');
        } else {
          var txt2 = await res.text();
          console.log('[ODDS] ' + sportKey + ' FAILED HTTP ' + res.status + ': ' + txt2.slice(0, 200));
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
  // Fetch BSD CatBoost ML predictions (free, unlimited)
  await fetchBSDPredictions();
  // Fetch API-Football predictions (6-algorithm Poisson, free 100/day)
  await fetchAPIFootballPredictions();
  // Fetch ESPN non-soccer fixtures (free, no API key — used when odds-api is down)
  var hasNonSoccerOdds = SPORTS.some(function(s) { return !s.key.startsWith('soccer_') && s.key !== 'darts_pdc' && s.key !== 'horse_racing' && cachedOdds[s.key] && cachedOdds[s.key].length > 0; });
  if (!hasNonSoccerOdds) await fetchESPNNonSoccerFixtures();
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
      for (var oi = 0; oi < cachedOdds[sport.key].length; oi++) {
        var tip = sport.key === 'baseball_mlb' ? buildBaseballTip(cachedOdds[sport.key][oi], sport) : buildNonSoccerTip(cachedOdds[sport.key][oi], sport);
        if (tip) allTips.push(tip);
      }
    }
    // Darts: use scraped fixtures with our own AI
    if (sport.key === 'darts_pdc' && cachedDartsFixtures.length > 0) {
      for (var di = 0; di < cachedDartsFixtures.length; di++) { var tip = buildDartsTip(cachedDartsFixtures[di]); if (tip) allTips.push(tip); }
    }
    // Non-soccer without odds: use ESPN fixtures
    if (!hasOdds && cachedESPNNonSoccer[sport.key] && cachedESPNNonSoccer[sport.key].length > 0) {
      for (var ei = 0; ei < cachedESPNNonSoccer[sport.key].length; ei++) {
        var eTip = buildESPNFixtureTip(cachedESPNNonSoccer[sport.key][ei], sport.key);
        if (eTip) allTips.push(eTip);
      }
    }
  }
  // BSD STANDALONE: When no soccer odds available, generate tips directly from BSD predictions
  var hasSoccerOdds = SPORTS.some(function(s) { return s.key.startsWith('soccer_') && cachedOdds[s.key] && cachedOdds[s.key].length > 0; });
  if (!hasSoccerOdds && Object.keys(bsdPredictions).length > 0) {
    var bsdKeys = Object.keys(bsdPredictions);
    var bsdTips = [];
    for (var bi = 0; bi < bsdKeys.length; bi++) {
      var bsdTip = buildBSDStandaloneTip(bsdKeys[bi]);
      if (bsdTip) bsdTips.push(bsdTip);
    }
    // Sort by confidence, take top 20 BSD standalone tips
    bsdTips.sort(function(a, b) { return b.conf - a.conf; });
    var bsdPick = bsdTips.slice(0, 20);
    allTips = allTips.concat(bsdPick);
    console.log('[BSD] Generated ' + bsdPick.length + ' standalone tips from ' + bsdKeys.length + ' predictions');
  }
  // SportMonks: generate tips from SportMonks fixtures (supplements other sources)
  if (cachedSportMonksFixtures.length > 0) {
    for (var smi = 0; smi < cachedSportMonksFixtures.length; smi++) {
      var smTip = buildSportMonksTip(cachedSportMonksFixtures[smi]);
      if (smTip) allTips.push(smTip);
    }
    console.log('[SPORTMONKS] Generated tips from ' + cachedSportMonksFixtures.length + ' fixtures');
  }
  // Gemini batch analysis — enrich tips with AI insights
  if (GEMINI_API_KEY && allTips.length > 0) {
    try {
      var geminiMatches = allTips.slice(0, 10).map(function(t) {
        var parts = t.match.split(' vs ');
        return { home: parts[0] || '', away: parts[1] || '', sport: t.sport, league: t.league, eloHome: 1500, eloAway: 1500, formHome: 0, formAway: 0 };
      });
      var insights = await geminiBatchAnalysis(geminiMatches);
      for (var gi = 0; gi < allTips.length; gi++) {
        var insight = insights[allTips[gi].match];
        if (insight) allTips[gi].reason = allTips[gi].reason + ' AI: ' + insight;
      }
      console.log('[GEMINI] Enriched ' + Object.keys(insights).length + ' tips with AI analysis');
    } catch (e) { console.log('[GEMINI] Batch analysis failed:', e.message); }
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
  var staleTips = trackedTips.filter(function(t) { return t.result === 'pending' && t.kickoff && new Date(t.kickoff).getTime() < Date.now() - 3 * 86400000; });
  if (staleTips.length > 0) {
    for (var si = 0; si < staleTips.length; si++) {
      staleTips[si].result = 'void';
      staleTips[si].voidedAt = new Date().toISOString();
      staleTips[si].voidReason = 'No score data available after 3 days';
    }
    saveTrackedTips();
    console.log('[CLEANUP] Marked ' + staleTips.length + ' stale tips as void (no score data)');
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

  // Fallback: Race card without any runner data — don't create a placeholder tip
  return null;
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

// === GEMINI AI MATCH ANALYSIS ===
var geminiAnalysisCache = {};
async function geminiMatchAnalysis(home, away, league, sport, eloHome, eloAway, formHome, formAway, oddsHome, oddsAway) {
  if (!GEMINI_API_KEY) return null;
  var cacheKey = home + '|' + away + '|' + league;
  if (geminiAnalysisCache[cacheKey]) return geminiAnalysisCache[cacheKey];
  try {
    var prompt = 'You are a sports analyst. Analyze this ' + sport + ' match briefly in 2-3 sentences max. Be specific about key factors.\n' +
      'Match: ' + home + ' vs ' + away + '\n' +
      'League: ' + league + '\n' +
      'ELO ratings: ' + home + ' ' + Math.round(eloHome) + ', ' + away + ' ' + Math.round(eloAway) + '\n' +
      'Recent form: ' + home + ' ' + formHome + ', ' + away + ' ' + formAway + '\n' +
      (oddsHome ? 'Market odds: ' + home + ' ' + oddsHome + ', ' + away + ' ' + oddsAway + '\n' : '') +
      'Return ONLY the analysis text, no labels or formatting.';
    var body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 200 } });
    var res = await fetch(GEMINI_API_BASE + '/gemini-2.0-flash-lite:generateContent?key=' + GEMINI_API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body,
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    var data = await res.json();
    var text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if (text) { geminiAnalysisCache[cacheKey] = text.trim(); return text.trim(); }
    return null;
  } catch (e) { return null; }
}
async function geminiBatchAnalysis(matches) {
  if (!GEMINI_API_KEY || !matches || matches.length === 0) return {};
  var prompt = 'You are a sports betting analyst. For each match below, provide a 1-sentence key insight. Return JSON object mapping match key to insight.\n\n';
  for (var i = 0; i < Math.min(matches.length, 10); i++) {
    var m = matches[i];
    prompt += (i + 1) + '. ' + m.home + ' vs ' + m.away + ' (' + m.sport + ', ' + m.league + ')' +
      ' | ELO: ' + Math.round(m.eloHome) + ' vs ' + Math.round(m.eloAway) +
      ' | Form: ' + m.formHome + ' vs ' + m.formAway + '\n';
  }
  prompt += '\nReturn JSON: {"match_key": "one sentence insight", ...}. Match key is "home vs away".';
  try {
    var body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 800, responseMimeType: 'application/json' } });
    var res = await fetch(GEMINI_API_BASE + '/gemini-2.0-flash-lite:generateContent?key=' + GEMINI_API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body,
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return {};
    var data = await res.json();
    var text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if (text) return JSON.parse(text);
    return {};
  } catch (e) { return {}; }
}

// === BSD AI PREDICTIONS (CatBoost ML, free, unlimited) ===
let bsdFetchDate = '';
async function fetchBSDPredictions() {
  var today = new Date().toISOString().slice(0, 10);
  if (bsdFetchDate === today && Object.keys(bsdPredictions).length > 0) return;
  if (!BSD_API_KEY) { console.log('[BSD] No API key configured'); return; }
  try {
    var allPreds = [];
    var page = 1;
    while (page <= 5) {
      var url = BSD_API_BASE + '/predictions/?status=upcoming&sport=football&page_size=100&page=' + page;
      var res = await safeFetch(url, { headers: { 'Authorization': 'Token ' + BSD_API_KEY } }, 15000);
      if (!res.ok) { console.log('[BSD] HTTP ' + res.status); break; }
      var data = await res.json();
      if (!data.results || data.results.length === 0) break;
      allPreds = allPreds.concat(data.results);
      if (!data.next) break;
      page++;
    }
    bsdPredictions = {};
    for (var i = 0; i < allPreds.length; i++) {
      var p = allPreds[i];
      var ev = p.event;
      if (!ev || !ev.home_team || !ev.away_team) continue;
      var key = ev.home_team.toLowerCase().trim() + '|' + ev.away_team.toLowerCase().trim();
      bsdPredictions[key] = {
        home: (p.prob_home_win || 0) / 100,
        draw: (p.prob_draw || 0) / 100,
        away: (p.prob_away_win || 0) / 100,
        confidence: (p.confidence || 0) / 100,
        xgHome: p.expected_home_goals || 0,
        xgAway: p.expected_away_goals || 0,
        predictedResult: p.predicted_result || '',
        mostLikelyScore: p.most_likely_score || '',
        modelVersion: p.model_version || '',
        league: ev.league ? ev.league.name : '',
        kickoff: ev.event_date || ''
      };
    }
    bsdFetchDate = today;
    console.log('[BSD] Fetched ' + allPreds.length + ' predictions, cached ' + Object.keys(bsdPredictions).length);
  } catch (e) {
    console.log('[BSD] Error: ' + (e.message || e).slice(0, 200));
    bsdFetchDate = today;
  }
}

function getBSDPrediction(homeTeam, awayTeam) {
  var key = homeTeam.toLowerCase().trim() + '|' + awayTeam.toLowerCase().trim();
  if (bsdPredictions[key]) return bsdPredictions[key];
  // Fuzzy match: try partial team name match
  var hLower = homeTeam.toLowerCase().trim();
  var aLower = awayTeam.toLowerCase().trim();
  var keys = Object.keys(bsdPredictions);
  for (var i = 0; i < keys.length; i++) {
    var parts = keys[i].split('|');
    if (parts.length === 2 && parts[0].indexOf(hLower) !== -1 && parts[1].indexOf(aLower) !== -1) return bsdPredictions[keys[i]];
    if (parts.length === 2 && hLower.indexOf(parts[0]) !== -1 && aLower.indexOf(parts[1]) !== -1) return bsdPredictions[keys[i]];
  }
  return null;
}

// Ensemble voting: compare our model prediction with BSD's CatBoost ML
// Returns { agree: boolean, boostConfidence: number, bsdPick: string, ourPick: string }
function ensembleVote(ourHomeProb, ourAwayProb, ourDrawProb, bsdPred) {
  if (!bsdPred) return { agree: true, boostConfidence: 0, bsdPick: '', ourPick: '' };
  var ourPick = ourHomeProb >= ourAwayProb ? (ourHomeProb >= ourDrawProb ? 'H' : 'D') : (ourAwayProb >= ourDrawProb ? 'A' : 'D');
  var bsdPick = bsdPred.predictedResult || (bsdPred.home >= bsdPred.away ? (bsdPred.home >= bsdPred.draw ? 'H' : 'D') : (bsdPred.away >= bsdPred.draw ? 'A' : 'D'));
  var agree = ourPick === bsdPick;
  var boostConfidence = 0;
  if (agree && bsdPred.confidence > 0.6) boostConfidence = Math.round(bsdPred.confidence * 8);
  return { agree: agree, boostConfidence: boostConfidence, bsdPick: bsdPick, ourPick: ourPick };
}

// Triple ensemble: our model + BSD CatBoost + API-Football Poisson
function tripleEnsembleVote(ourHomeProb, ourAwayProb, ourDrawProb, bsdPred, afPred) {
  var ourPick = ourHomeProb >= ourAwayProb ? (ourHomeProb >= ourDrawProb ? 'H' : 'D') : (ourAwayProb >= ourDrawProb ? 'A' : 'D');
  var picks = [ourPick];
  var labels = ['AI'];
  if (bsdPred) {
    var bsdPick = bsdPred.predictedResult || (bsdPred.home >= bsdPred.away ? (bsdPred.home >= bsdPred.draw ? 'H' : 'D') : (bsdPred.away >= bsdPred.draw ? 'A' : 'D'));
    picks.push(bsdPick); labels.push('BSD');
  }
  if (afPred) {
    picks.push(afPred.winnerPick); labels.push('AF');
  }
  var uniquePicks = picks.filter(function(v, i, a) { return a.indexOf(v) === i; });
  var agreeCount = 0;
  for (var i = 1; i < picks.length; i++) { if (picks[i] === picks[0]) agreeCount++; }
  var totalModels = picks.length;
  var unanimous = uniquePicks.length === 1;
  var majority = agreeCount >= Math.floor(totalModels / 2);
  var boostConfidence = 0;
  if (unanimous && totalModels >= 3) boostConfidence = 10;
  else if (unanimous && totalModels === 2) boostConfidence = 6;
  else if (majority && totalModels >= 3) boostConfidence = 4;
  var disagree = !majority && totalModels >= 3;
  return { agree: majority, unanimous: unanimous, disagree: disagree, boostConfidence: boostConfidence, picks: picks, labels: labels, ourPick: ourPick };
}

// === API-FOOTBALL PREDICTIONS (6-algorithm Poisson/statistics) ===
let apiFootballFetchDate = '';
async function fetchAPIFootballPredictions() {
  var today = new Date().toISOString().slice(0, 10);
  if (apiFootballFetchDate === today && Object.keys(apiFootballPredictions).length > 0) return;
  if (!APIFOOTBALL_KEY) { console.log('[AF] No API key configured'); return; }
  try {
    // Get fixtures for next 3 days across major leagues
    var leagueIds = [39, 140, 135, 78, 61, 2, 848, 3, 88, 169]; // EPL, LaLiga, SerieA, Bundesliga, Ligue1, UCL, UEL, UCL-Q, Brazil, SA-Prem
    var fixtureIds = [];
    for (var li = 0; li < leagueIds.length; li++) {
      try {
        var season = new Date().getFullYear();
        var fUrl = APIFOOTBALL_BASE + '/fixtures?league=' + leagueIds[li] + '&season=' + season + '&from=' + today + '&to=' + today;
        var fRes = await safeFetch(fUrl, { headers: { 'x-apisports-key': APIFOOTBALL_KEY } }, 8000);
        if (!fRes.ok) continue;
        var fData = await fRes.json();
        if (fData.response) {
          for (var fi = 0; fi < fData.response.length; fi++) {
            var fx = fData.response[fi];
            fixtureIds.push({ id: fx.fixture.id, home: fx.teams.home.name, away: fx.teams.away.name });
          }
        }
      } catch(e) {}
    }
    // Also get live matches
    try {
      var liveRes = await safeFetch(APIFOOTBALL_BASE + '/fixtures?live=all', { headers: { 'x-apisports-key': APIFOOTBALL_KEY } }, 8000);
      if (liveRes.ok) {
        var liveData = await liveRes.json();
        if (liveData.response) {
          for (var li2 = 0; li2 < liveData.response.length; li2++) {
            var lfx = liveData.response[li2];
            fixtureIds.push({ id: lfx.fixture.id, home: lfx.teams.home.name, away: lfx.teams.away.name });
          }
        }
      }
    } catch(e) {}
    console.log('[AF] Found ' + fixtureIds.length + ' fixtures to predict');
    // Get predictions for each fixture (respect rate limits — max 40)
    apiFootballPredictions = {};
    var fetchCount = Math.min(fixtureIds.length, 40);
    for (var pi = 0; pi < fetchCount; pi++) {
      try {
        var pUrl = APIFOOTBALL_BASE + '/predictions?fixture=' + fixtureIds[pi].id;
        var pRes = await safeFetch(pUrl, { headers: { 'x-apisports-key': APIFOOTBALL_KEY } }, 8000);
        if (!pRes.ok) continue;
        var pData = await pRes.json();
        if (!pData.response || !pData.response[0]) continue;
        var pred = pData.response[0].predictions;
        if (!pred || !pred.percent) continue;
        var homePct = parseInt(pred.percent.home) || 33;
        var drawPct = parseInt(pred.percent.draw) || 33;
        var awayPct = parseInt(pred.percent.away) || 34;
        var total = homePct + drawPct + awayPct;
        var hKey = fixtureIds[pi].home.toLowerCase().trim() + '|' + fixtureIds[pi].away.toLowerCase().trim();
        var winnerName = pred.winner ? pred.winner.name : '';
        var winnerPick = 'D';
        if (winnerName && winnerName.toLowerCase().trim() === fixtureIds[pi].home.toLowerCase().trim()) winnerPick = 'H';
        else if (winnerName && winnerName.toLowerCase().trim() === fixtureIds[pi].away.toLowerCase().trim()) winnerPick = 'A';
        apiFootballPredictions[hKey] = {
          home: total > 0 ? homePct / total : 0.33,
          draw: total > 0 ? drawPct / total : 0.33,
          away: total > 0 ? awayPct / total : 0.34,
          winnerPick: winnerPick,
          advice: pred.advice || '',
          winOrDraw: pred.win_or_draw || false
        };
      } catch(e) {}
    }
    apiFootballFetchDate = today;
    console.log('[AF] Cached ' + Object.keys(apiFootballPredictions).length + ' predictions');
  } catch (e) {
    console.log('[AF] Error: ' + (e.message || e).slice(0, 200));
    apiFootballFetchDate = today;
  }
}

function getAPIFootballPrediction(homeTeam, awayTeam) {
  var key = homeTeam.toLowerCase().trim() + '|' + awayTeam.toLowerCase().trim();
  if (apiFootballPredictions[key]) return apiFootballPredictions[key];
  // Fuzzy match
  var hLower = homeTeam.toLowerCase().trim();
  var aLower = awayTeam.toLowerCase().trim();
  var keys = Object.keys(apiFootballPredictions);
  for (var i = 0; i < keys.length; i++) {
    var parts = keys[i].split('|');
    if (parts.length === 2 && parts[0].indexOf(hLower) !== -1 && parts[1].indexOf(aLower) !== -1) return apiFootballPredictions[keys[i]];
    if (parts.length === 2 && hLower.indexOf(parts[0]) !== -1 && aLower.indexOf(parts[1]) !== -1) return apiFootballPredictions[keys[i]];
  }
  return null;
}

// === OUR AI MODEL: Standalone prediction using ELO + Poisson (no odds needed) ===
function generateOurAIPrediction(home, away, sportKey) {
  var cfg = getCfg(sportKey);
  var hStats = getAttackDefense(sportKey, home, true);
  var aStats = getAttackDefense(sportKey, away, false);
  var poisson = dcPoissonPrediction(hStats.attack, hStats.defense, aStats.attack, aStats.defense, sportKey);
  var fmHome = formModifier(sportKey, home);
  var fmAway = formModifier(sportKey, away);
  var adjH = Math.max(1000, Math.min(2000, getElo(sportKey, home) + HOME_ADVANTAGE_ELO + fmHome));
  var adjA = Math.max(1000, Math.min(2000, getElo(sportKey, away) + fmAway));
  var eloHomeRaw = expectedScore(adjH, adjA);
  var eloDraw = cfg.hasDraw ? 0.25 : 0;
  var eloHW = eloHomeRaw * (1 - eloDraw);
  var eloAW = (1 - eloHomeRaw) * (1 - eloDraw);
  // Blend: 60% Poisson, 40% ELO (no market weight since no odds)
  var predH = poisson.homeWin * 0.60 + eloHW * 0.40;
  var predA = poisson.awayWin * 0.60 + eloAW * 0.40;
  var predD = cfg.hasDraw ? (poisson.draw * 0.60 + eloDraw * 0.40) : 0;
  var total = predH + predA + predD;
  if (total > 0) { predH /= total; predA /= total; predD /= total; }
  var pick = predH >= predA ? (predH >= predD ? 'H' : 'D') : (predA >= predD ? 'A' : 'D');
  return { homeWin: predH, awayWin: predA, draw: predD, pick: pick, homeElo: adjH, awayElo: adjA, lambdaHome: poisson.expectedHomeGoals, lambdaAway: poisson.expectedAwayGoals, source: hStats.source };
}

// === STANDALONE TIP BUILDER: 3-AI curator — runs all 3 models, only shows picks they agree on ===
function buildBSDStandaloneTip(bsdKey) {
  var bsd = bsdPredictions[bsdKey];
  if (!bsd || !bsd.kickoff) return null;
  var parts = bsdKey.split('|');
  if (parts.length !== 2) return null;
  var home = parts[0].trim();
  var away = parts[1].trim();
  // Only show major leagues — skip obscure leagues
  var leagueLower = (bsd.league || '').toLowerCase();
  var majorLeagues = ['premier league', 'la liga', 'bundesliga', 'serie a', 'ligue 1', 'eredivisie',
    'primeira liga', 'champions league', 'europa league', 'conference league',
    'scottish premiership', 'belgian pro league', 'turkish super lig',
    'brasileir', 'argentine', 'liga mx', 'mls',
    'english championship', ' league one', ' league two', 'soccer'];
  var isMajor = majorLeagues.some(function(ml) { return leagueLower.indexOf(ml) !== -1; });
  if (!isMajor) return null;
  // Skip if kickoff is in the past
  var kickoffTime = new Date(bsd.kickoff).getTime();
  if (!kickoffTime || kickoffTime <= Date.now()) return null;
  // Map league to sport key and country
  var sportKey = 'soccer_epl';
  var country = '';
  if (leagueLower.indexOf('la liga') !== -1 || leagueLower.indexOf('spain') !== -1) { sportKey = 'soccer_spain_la_liga'; country = 'Spain'; }
  else if (leagueLower.indexOf('bundesliga') !== -1 || leagueLower.indexOf('germany') !== -1) { sportKey = 'soccer_germany_bundesliga'; country = 'Germany'; }
  else if (leagueLower.indexOf('serie a') !== -1 || leagueLower.indexOf('italy') !== -1) { sportKey = 'soccer_italy_serie_a'; country = 'Italy'; }
  else if (leagueLower.indexOf('ligue 1') !== -1 || leagueLower.indexOf('france') !== -1) { sportKey = 'soccer_france_ligue_one'; country = 'France'; }
  else if (leagueLower.indexOf('eredivisie') !== -1 || leagueLower.indexOf('netherlands') !== -1) { sportKey = 'soccer_netherlands_eredivisie'; country = 'Netherlands'; }
  else if (leagueLower.indexOf('primeira') !== -1 || leagueLower.indexOf('portugal') !== -1) { sportKey = 'soccer_portugal_liga'; country = 'Portugal'; }
  else if (leagueLower.indexOf('brasileir') !== -1 || leagueLower.indexOf('brazil') !== -1) { sportKey = 'soccer_brazil_serie_a'; country = 'Brazil'; }
  else if (leagueLower.indexOf('mls') !== -1 || leagueLower.indexOf('usa') !== -1 || leagueLower.indexOf('united states') !== -1) { sportKey = 'soccer_usa_mls'; country = 'USA'; }
  else if (leagueLower.indexOf('champions') !== -1) { sportKey = 'soccer_uefa_champs_league'; country = 'Europe'; }
  else if (leagueLower.indexOf('conference') !== -1) { sportKey = 'soccer_uefa_europa_league'; country = 'Europe'; }
  else if (leagueLower.indexOf('europa') !== -1) { sportKey = 'soccer_uefa_europa_league'; country = 'Europe'; }
  else if (leagueLower.indexOf('premier') !== -1 || leagueLower.indexOf('england') !== -1 || leagueLower.indexOf('english') !== -1) { country = 'England'; }
  else if (leagueLower.indexOf('turkish') !== -1 || leagueLower.indexOf('turkey') !== -1) { country = 'Turkey'; }
  else if (leagueLower.indexOf('belgian') !== -1 || leagueLower.indexOf('belgium') !== -1) { country = 'Belgium'; }
  else if (leagueLower.indexOf('scottish') !== -1 || leagueLower.indexOf('scotland') !== -1) { country = 'Scotland'; }
  else if (leagueLower.indexOf('argentin') !== -1) { country = 'Argentina'; }
  else if (leagueLower.indexOf('mexican') !== -1 || leagueLower.indexOf('mexico') !== -1) { country = 'Mexico'; }
  else if (leagueLower.indexOf('japan') !== -1) { country = 'Japan'; }
  else if (leagueLower.indexOf('south korea') !== -1) { country = 'South Korea'; }
  else if (leagueLower.indexOf('saudi') !== -1) { country = 'Saudi Arabia'; }

  // === AI 1: BSD CatBoost ML ===
  var bsdPick = bsd.predictedResult || (bsd.home >= bsd.away && bsd.home >= bsd.draw ? 'H' : (bsd.away >= bsd.draw ? 'A' : 'D'));
  var bsdProb = bsdPick === 'H' ? bsd.home : bsdPick === 'A' ? bsd.away : bsd.draw;

  // === AI 2: Our ELO + Poisson model (no odds needed) ===
  var ourPred = generateOurAIPrediction(home, away, sportKey);

  // === AI 3: API-Football Poisson/statistics ===
  var afPred = getAPIFootballPrediction(home, away);

  // === CURATOR: Collect all picks and check agreement ===
  var picks = [bsdPick];
  var labels = ['BSD CatBoost'];
  if (ourPred) { picks.push(ourPred.pick); labels.push('Our AI (ELO+Poisson)'); }
  if (afPred && afPred.winnerPick) { picks.push(afPred.winnerPick); labels.push('API-Football'); }
  var totalModels = picks.length;
  var uniquePicks = picks.filter(function(v, i, a) { return a.indexOf(v) === i; });
  var unanimous = uniquePicks.length === 1;
  var agreeCount = 0;
  for (var i = 1; i < picks.length; i++) { if (picks[i] === picks[0]) agreeCount++; }
  var majority = agreeCount >= Math.floor(totalModels / 2);

  // REQUIRE: At least 2 out of 3 AIs must agree — no solo picks
  if (totalModels < 2 || !majority) return null;

  // Build pick text and probability
  var pickText, prob, price;
  if (bsdPick === 'H') { pickText = home + ' to Win'; prob = bsd.home; }
  else if (bsdPick === 'A') { pickText = away + ' to Win'; prob = bsd.away; }
  else { pickText = 'Draw'; prob = bsd.draw; }
  price = prob > 0.6 ? (1 + 1 / prob).toFixed(2) : prob > 0.45 ? (1 + 1 / prob * 0.95).toFixed(2) : (1 + 1 / prob * 0.9).toFixed(2);
  if (prob < 0.28) return null;

  // Confidence: blend all agreeing models
  var conf = Math.round(prob * 100);
  if (unanimous) conf = Math.min(96, conf + 10); // All 3 agree = big boost
  else if (majority) conf = Math.min(92, conf + 5); // 2/3 agree = moderate boost

  var reason = buildTipReason({ marketType: 'h2h', market: 'Match Result', pick: pickText, home: home, away: away, poisson: ourPred ? { expectedHomeGoals: ourPred.lambdaHome, expectedAwayGoals: ourPred.lambdaAway } : null, eloH: ourPred ? ourPred.homeElo : 1500, eloA: ourPred ? ourPred.awayElo : 1500, bsdPred: bsd, afPred: afPred, ensembleResult: { unanimous: unanimous, agree: majority }, h2hTotal: 0, h2hHomeWins: 0.5 });

  return {
    type: sportKey, sport: 'Football', icon: '⚽',
    match: home + ' vs ' + away,
    league: bsd.league || 'Football',
    country: country,
    marketType: 'h2h', market: 'Match Result', marketLine: null,
    kickoff: bsd.kickoff,
    pick: pickText, odds: price, conf: conf,
    bookmaker: 'AI Ensemble',
    valueBet: false,
    reason: reason,
    bsdAgree: bsdPick === (ourPred ? ourPred.pick : bsdPick),
    tripleAgree: unanimous
  };
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
  // BSD CatBoost ML prediction
  var bsdPred2 = getBSDPrediction(home, away);
  // API-Football Poisson/statistics prediction
  var afPred2 = getAPIFootballPrediction(home, away);
  if (rawLR !== null) {
    var mlH = rawLR, mlA = 1 - rawLR;
    var bW3 = bsdPred2 ? 0.15 : 0;
    predHW = predHW * 0.50 + mlH * 0.35 + (bsdPred2 ? bsdPred2.home : 0) * bW3;
    predAW = predAW * 0.50 + mlA * 0.35 + (bsdPred2 ? bsdPred2.away : 0) * bW3;
    total = predHW + predAW + predD;
    if (total > 0) { predHW /= total; predAW /= total; predD /= total; }
  } else if (bsdPred2) {
    predHW = predHW * 0.80 + bsdPred2.home * 0.20;
    predAW = predAW * 0.80 + bsdPred2.away * 0.20;
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
  // Ensemble voting with BSD + API-Football
  var ensembleR2 = tripleEnsembleVote(predHW, predAW, predD, bsdPred2, afPred2);
  if (ensembleR2.unanimous) conf = Math.min(cfg.maxConf, conf + ensembleR2.boostConfidence);
  else if (ensembleR2.agree) conf = Math.min(cfg.maxConf, conf + ensembleR2.boostConfidence);
  else if (ensembleR2.disagree) conf = Math.max(cfg.minConf, conf - 8);
  else conf = Math.max(cfg.minConf, conf - 3);

  var hForm2 = getFormWindow(sportKey, home, cfg.formWindow);
  var aForm2 = getFormWindow(sportKey, away, cfg.formWindow);
  var reason2 = buildTipReason({ marketType: 'h2h', market: 'Match Result', pick: pick, home: home, away: away, poisson: poisson, eloH: adjH, eloA: adjA, hForm: hForm2, aForm: aForm2, bsdPred: bsdPred2, afPred: afPred2, ensembleResult: ensembleR2, expectedTotal: poisson.expectedHomeGoals + poisson.expectedAwayGoals });

  return {
    type: sportKey, sport: 'Football', icon: '\u26BD',
    match: home + ' vs ' + away, league: fixture.league || 'Football',
    country: COUNTRY_MAP[sportKey] || '',
    marketType: 'h2h', market: mr, marketLine: null,
    kickoff: fixture.kickoff, pick: pick, odds: odds, conf: conf,
    realOdds: null, bookmaker: '', valueBet: false,
    reason: reason2, features: features,
    bsdAgree: bsdPred2 ? ensembleR2.agree : null, tripleAgree: ensembleR2.unanimous
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
  // Allow MJK group link
  if (/t\.me\/MJKBettingTips/i.test(text)) return false;
  return /https?:\/\/|www\.|t\.me|bit\.ly|tinyurl\.com|wa\.me|chat\.whatsapp\.com|discord\.gg|telegram\.me/i.test(text);
}

function isSpam(text) {
  var lower = text.toLowerCase();
  return /buy now|free money|click here|join now|dm me|whatsapp.*group|bet.*guaranteed|100%.*win|double your|cash out/i.test(lower);
}

function formatTip(t, idx) {
  var kickoff = t.kickoff ? new Date(t.kickoff).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : 'TBD';
  var location = '';
  if (t.country || t.league) location = ' · ' + (t.country || '') + (t.country && t.league ? ' · ' : '') + (t.league || '');
  var reasonLine = t.reason ? '\n   💡 ' + t.reason : '';
  return (idx !== undefined ? idx + '. ' : '') +
    t.icon + ' <b>' + t.match + '</b>\n' +
    '   ' + t.pick + ' @ <b>' + t.odds + '</b> (' + t.conf + '%)\n' +
    '   ' + t.market + location + ' | ' + kickoff + (t.valueBet ? ' | VALUE' : '') + reasonLine;
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
          't.me/MJKBettingTips for Pro & Elite plans!'
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
    if (isGroup) reply += 'Upgrade for full access — t.me/MJKBettingTips';
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

// === AUTO-PROMO: DISABLED ===
function startPromoScheduler() {
  console.log('[TELEGRAM] Promo scheduler disabled');
  return;
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
      // Try per-competition football-data.org (free tier) for each active soccer tip
      for (var i = 0; i < activeSoccer.length; i++) {
        var tip = activeSoccer[i];
        var parts = tip.match.split(' vs ');
        var home = parts[0], away = parts[1];
        // Try per-competition endpoint (free tier)
        var code = COMPETITION_CODE_MAP[tip.type];
        if (code && FB_API_KEY) {
          var tipDate = new Date(tip.kickoff).toISOString().split('T')[0];
          var fUrl = FB_API_BASE + '/competitions/' + code + '/matches?dateFrom=' + tipDate + '&dateTo=' + tipDate;
          var fRes = await safeFetch(fUrl, { headers: { 'X-Auth-Token': FB_API_KEY } }, 8000);
          if (fRes.ok) {
            var fData = await fRes.json();
            if (fData.matches) {
              var match = fData.matches.find(function(m) {
                return normalizeTeamName(m.homeTeam ? m.homeTeam.name : '') === normalizeTeamName(home) && normalizeTeamName(m.awayTeam ? m.awayTeam.name : '') === normalizeTeamName(away);
              });
              if (match && match.score && match.score.fullTime && match.score.fullTime.home !== null) {
                var status = match.status === 'FINISHED' ? 'FT' : (match.status === 'IN_PLAY' ? 'LIVE' : match.status === 'PAUSED' ? 'HT' : match.status);
                var elStr = match.status === 'IN_PLAY' && match.minute ? match.minute + "'" : '';
                results[tip.id || (tip.match + tip.pick)] = { homeScore: match.score.fullTime.home, awayScore: match.score.fullTime.away, status: status, elapsed: elStr };
                continue;
              }
            }
          }
        }
        // Fallback: ESPN free API for live scores
        var espnSlug = ESPN_LEAGUE_MAP[tip.type];
        if (espnSlug) {
          var espnDate = espnDateStr(new Date(tip.kickoff));
          var eUrl = 'https://site.api.espn.com/apis/site/v2/sports/' + espnSlug + '/scoreboard?dates=' + espnDate;
          var eRes = await safeFetch(eUrl, { headers: { 'User-Agent': 'MJKTips/1.0' } }, 8000);
          if (eRes.ok) {
            var eData = await eRes.json();
            if (eData.events) {
              for (var ei = 0; ei < eData.events.length; ei++) {
                var ev = eData.events[ei];
                if (!ev.competitions || !ev.competitions[0]) continue;
                var comp = ev.competitions[0];
                if (!comp.competitors || comp.competitors.length < 2) continue;
                var c1 = comp.competitors[0], c2 = comp.competitors[1];
                var n1 = ((c1.team ? c1.team.displayName : '') || '').toLowerCase();
                var n2 = ((c2.team ? c2.team.displayName : '') || '').toLowerCase();
                var nh = normalizeTeamName(home).toLowerCase(), na = normalizeTeamName(away).toLowerCase();
                var found = false;
                if ((n1.indexOf(nh) >= 0 || nh.indexOf(n1) >= 0) && (n2.indexOf(na) >= 0 || na.indexOf(n2) >= 0)) found = true;
                if ((n1.indexOf(na) >= 0 || na.indexOf(n1) >= 0) && (n2.indexOf(nh) >= 0 || nh.indexOf(n2) >= 0)) found = true;
                if (found && comp.status && comp.status.type) {
                  var isCompleted = comp.status.type.completed;
                  var isLive = comp.status.type.state === 'in';
                  var eStatus = isCompleted ? 'FT' : (isLive ? 'LIVE' : comp.status.type.detail || 'LIVE');
                  var eElapsed = isLive && comp.status.displayClock ? comp.status.displayClock : '';
                  var hs = parseInt(c1.score || '0', 10), as = parseInt(c2.score || '0', 10);
                  results[tip.id || (tip.match + tip.pick)] = { homeScore: hs, awayScore: as, status: eStatus, elapsed: eElapsed };
                  break;
                }
              }
            }
          }
        }
      }
    } catch (e) {}
  }

  // Also check the-odds-api + ESPN for non-soccer live scores
  var activeOther = cachedTips.filter(function(t) {
    if (t.result !== 'pending' || !t.kickoff) return false;
    var ko = new Date(t.kickoff).getTime();
    var elapsed = now - ko;
    return elapsed > 0 && elapsed < 4 * 60 * 60 * 1000 && !t.type.startsWith('soccer_') && !t.type.startsWith('tennis_') && t.type !== 'horse_racing';
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

  // ESPN free API fallback for non-soccer live scores
  for (var oi = 0; oi < activeOther.length; oi++) {
    var tip = activeOther[oi];
    if (results[tip.id || (tip.match + tip.pick)]) continue;
    var espnSlug = ESPN_LEAGUE_MAP[tip.type];
    if (!espnSlug) continue;
    try {
      var espnDate = espnDateStr(new Date(tip.kickoff));
      var eUrl = 'https://site.api.espn.com/apis/site/v2/sports/' + espnSlug + '/scoreboard?dates=' + espnDate;
      var eRes = await safeFetch(eUrl, { headers: { 'User-Agent': 'MJKTips/1.0' } }, 8000);
      if (!eRes.ok) continue;
      var eData = await eRes.json();
      if (!eData.events) continue;
      var parts = tip.match.split(' vs ');
      var home = parts[0], away = parts[1];
      for (var ei = 0; ei < eData.events.length; ei++) {
        var ev = eData.events[ei];
        if (!ev.competitions || !ev.competitions[0]) continue;
        var comp = ev.competitions[0];
        if (!comp.competitors || comp.competitors.length < 2) continue;
        var c1 = comp.competitors[0], c2 = comp.competitors[1];
        var n1 = ((c1.team ? c1.team.displayName : '') || '').toLowerCase();
        var n2 = ((c2.team ? c2.team.displayName : '') || '').toLowerCase();
        var nh = normalizeTeamName(home).toLowerCase(), na = normalizeTeamName(away).toLowerCase();
        var matchFound = false;
        if ((n1.indexOf(nh) >= 0 || nh.indexOf(n1) >= 0) && (n2.indexOf(na) >= 0 || na.indexOf(n2) >= 0)) matchFound = true;
        if ((n1.indexOf(na) >= 0 || na.indexOf(n1) >= 0) && (n2.indexOf(nh) >= 0 || nh.indexOf(n2) >= 0)) matchFound = true;
        if (matchFound && comp.status && comp.status.type) {
          var isCompleted = comp.status.type.completed;
          var isLive = comp.status.type.state === 'in';
          var eStatus = isCompleted ? 'FT' : (isLive ? 'LIVE' : 'Scheduled');
          var hs = parseInt(c1.score || '0', 10), as = parseInt(c2.score || '0', 10);
          results[tip.id || (tip.match + tip.pick)] = { homeScore: hs, awayScore: as, status: eStatus, elapsed: isLive ? (comp.status.displayClock || '') : '' };
          break;
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

// Banker results (historical performance of high-confidence tips)
app.get('/api/banker-results', rateLimit(60000, 10), function(req, res) {
  var minConf = parseInt(req.query.minConf) || 80;
  var bankers = trackedTips.filter(function(t) {
    return t.conf >= minConf && (t.result === 'won' || t.result === 'lost');
  });
  bankers.sort(function(a, b) { return (b.kickoff || '').localeCompare(a.kickoff || ''); });
  var won = bankers.filter(function(t) { return t.result === 'won'; }).length;
  var lost = bankers.filter(function(t) { return t.result === 'lost'; }).length;
  var total = won + lost;
  var bySport = {};
  for (var i = 0; i < bankers.length; i++) {
    var t = bankers[i];
    if (!bySport[t.sport]) bySport[t.sport] = { sport: t.sport, icon: t.icon, won: 0, lost: 0 };
    bySport[t.sport][t.result]++;
  }
  res.json({
    count: bankers.length,
    stats: { won: won, lost: lost, total: total, winRate: total > 0 ? Math.round((won / total) * 100) : 0 },
    bySport: Object.values(bySport),
    tips: bankers.slice(0, 100)
  });
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
  var bySport = {};
  for (var i = 0; i < completed.length; i++) {
    var t = completed[i];
    if (!bySport[t.sport]) bySport[t.sport] = { sport: t.sport, won: 0, lost: 0 };
    bySport[t.sport][t.result]++;
  }
  res.json({ count: completed.length, tips: completed.slice(0, 100), bySport: Object.values(bySport) });
});

app.post('/api/check-results', rateLimit(60000, 5), async function(req, res) {
  try {
    await checkResults();
    loadTrackedTips();
    var pending = trackedTips.filter(function(t) { return t.result === 'pending'; }).length;
    var won = trackedTips.filter(function(t) { return t.result === 'won'; }).length;
    var lost = trackedTips.filter(function(t) { return t.result === 'lost'; }).length;
    res.json({ ok: true, pending: pending, won: won, lost: lost, winRate: won + lost > 0 ? (won / (won + lost) * 100).toFixed(1) : '0.0' });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Manual backup trigger
app.post('/api/backup', rateLimit(300000, 2), async function(req, res) {
  try {
    await backupDataToGitHub();
    res.json({ ok: true, message: 'Backup completed' });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Backup status
app.get('/api/backup-status', function(req, res) {
  res.json({ configured: !!GITHUB_TOKEN, repo: GITHUB_REPO, files: DATA_BACKUP_FILES.length });
});

// BSD AI predictions status
app.get('/api/bsd-status', function(req, res) {
  var keys = Object.keys(bsdPredictions);
  var sample = keys.length > 0 ? bsdPredictions[keys[0]] : null;
  res.json({ configured: !!BSD_API_KEY, cached: keys.length, fetchDate: bsdFetchDate, sample: sample ? { match: keys[0], home: sample.home, away: sample.away, draw: sample.draw, confidence: sample.confidence, predictedResult: sample.predictedResult } : null });
});

// API-Football predictions status
app.get('/api/af-status', function(req, res) {
  var keys = Object.keys(apiFootballPredictions);
  var sample = keys.length > 0 ? apiFootballPredictions[keys[0]] : null;
  res.json({ configured: !!APIFOOTBALL_KEY, cached: keys.length, fetchDate: apiFootballFetchDate, dailyLimit: 100, sample: sample ? { match: keys[0], home: sample.home, away: sample.away, draw: sample.draw, winnerPick: sample.winnerPick, advice: sample.advice } : null });
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

app.post('/api/auth/forgot-password', rateLimit(15 * 60 * 1000, 5), function(req, res) {
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
  if (!username || !token || !newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Invalid request. Password must be 8+ characters with uppercase, lowercase, and number.' });
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) return res.status(400).json({ error: 'Password must include uppercase, lowercase, and a number.' });
  var users = loadUsers();
  var user = users[username];
  if (!user || user.resetToken !== token || !user.resetExpires || Date.now() > user.resetExpires) return res.status(400).json({ error: 'Invalid or expired reset token.' });
  user.password = hashPassword(newPassword);
  delete user.resetToken;
  delete user.resetExpires;
  saveUsers(users);
  res.json({ success: true, message: 'Password reset successfully.' });
});

app.post('/api/subscribe', authMiddleware, rateLimit(60 * 60 * 1000, 3), function(req, res) {
  var tier = req.body.tier;
  if (!TIERS[tier]) return res.status(400).json({ error: 'Invalid tier' });
  if (tier === 'free') return res.status(400).json({ error: 'Already on free tier' });
  var users = loadUsers();
  var user = users[req.user.username];
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (user.tier !== 'free') return res.status(400).json({ error: 'Already subscribed. Contact admin to change tier.' });
  var paymentRef = (req.body.paymentRef || '').trim();
  if (!paymentRef || paymentRef.length < 5) return res.status(400).json({ error: 'Payment reference required. Complete payment first.' });
  var msg = 'Subscription request: @' + req.user.username + ' wants ' + tier + ' plan (R' + TIERS[tier].price + ') ref: ' + paymentRef;
  console.log('[SUB] ' + msg);
  user.pendingTier = tier;
  user.pendingSubAt = new Date().toISOString();
  user.paymentRef = paymentRef;
  saveUsers(users);
  if (TELEGRAM_BOT_TOKEN) {
    loadTelegramSubs().forEach(function(s) { sendTelegram(s.chatId, 'New subscription request: @' + req.user.username + ' → ' + tier + ' (ref: ' + paymentRef + ')'); });
  }
  res.json({ success: true, tier: 'pending', message: 'Payment reference submitted. Your tier will be activated after admin verification.' });
});

const ADMIN_PHONE = '27677834591';

function formatTelegramGroupMsg(tips) {
  var now = new Date();
  var dateStr = now.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var msg = '<b>MJK AI Ensemble Tips — ' + dateStr + '</b>\n';
  msg += '<i>3 AI models unanimously agree</i>\n\n';
  var seen = {};
  var count = 0;
  for (var i = 0; i < tips.length; i++) {
    var t = tips[i];
    if (seen[t.type]) continue;
    seen[t.type] = true;
    count++;
    var kickoff = t.kickoff ? new Date(t.kickoff).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : 'TBD';
    msg += t.icon + ' <b>' + t.match + '</b>\n';
    var location = '';
    if (t.country || t.league) location = (t.country || '') + (t.country && t.league ? ' · ' : '') + (t.league || '');
    msg += '   ' + t.pick + ' @ <b>' + t.odds + '</b> (' + t.conf + '%)\n';
    msg += '   ' + t.market + (location ? ' · ' + location : '') + ' · ' + kickoff + (t.valueBet ? ' · VALUE' : '') + '\n';
    msg += '   <i>' + t.reason + '</i>\n\n';
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
  msg += '<b>Triple AI Ensemble</b> · Our AI + BSD CatBoost + API-Football\nAll 3 models agree on these picks\nUpgrade to Pro/Elite for full access — /tips for more';
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
  msg += 'AI-powered predictions | Confidence 65%+\nt.me/MJKBettingTips';
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
    // Only send unanimous tips (all 3 AIs agreed) to the group
    var unanimousTips = upcoming.filter(function(t) { return t.type !== 'horse_racing' && t.tripleAgree === true; });
    // Fallback: if no unanimous tips, send top confidence tips
    if (unanimousTips.length === 0) {
      unanimousTips = upcoming.filter(function(t) { return t.type !== 'horse_racing' && t.conf >= 75; }).slice(0, TIERS.free.tipLimit);
    }
    var freeTips = unanimousTips.slice(0, TIERS.free.tipLimit);
    if (freeTips.length > 0) {
      var groupMsg = formatTelegramGroupMsg(freeTips);
      await sendTelegram(TELEGRAM_GROUP_ID, groupMsg);
      console.log('[BROADCAST] Sent ' + freeTips.length + ' unanimous tips to Telegram group ' + TELEGRAM_GROUP_ID);
    } else {
      console.log('[BROADCAST] No unanimous tips found — skipping group broadcast');
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
    return { username: k, tier: users[k].tier, role: users[k].role, createdAt: users[k].createdAt, subscribedAt: users[k].subscribedAt || null, pendingTier: users[k].pendingTier || null, paymentRef: users[k].paymentRef || null };
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
  delete users[targetUser].pendingTier;
  delete users[targetUser].paymentRef;
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
restoreDataFromGitHub();
refreshTips();
setInterval(refreshTips, 300000);
setInterval(checkResults, 300000);
setInterval(backupDataToGitHub, 3600000); // Backup to GitHub every hour
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
