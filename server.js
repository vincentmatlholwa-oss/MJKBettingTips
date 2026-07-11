require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
const port = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'mjk-secret-' + require('crypto').randomBytes(16).toString('hex');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

const FB_API_KEY = process.env.FOOTBALL_DATA_API_KEY || '';
const FB_API_BASE = 'https://api.football-data.org/v4';
const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || 'whatsapp:+27677834591';

const RESULTS_FILE = path.join(__dirname, 'data', 'tracked_results.json');
const ELO_FILE = path.join(__dirname, 'data', 'elo_ratings.json');
const CALIB_FILE = path.join(__dirname, 'data', 'calibration.json');
const FORM_FILE = path.join(__dirname, 'data', 'form_tracker.json');
const WEIGHTS_FILE = path.join(__dirname, 'data', 'adaptive_weights.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const APIKEYS_FILE = path.join(__dirname, 'data', 'api_keys.json');
const TELEGRAM_FILE = path.join(__dirname, 'data', 'telegram_subs.json');
const SPORT_PREFS_FILE = path.join(__dirname, 'data', 'sport_prefs.json');

// === Advanced AI data files ===
const TEAM_STATS_FILE = path.join(__dirname, 'data', 'team_stats.json');
const H2H_FILE = path.join(__dirname, 'data', 'head_to_head.json');
const MATCH_DATES_FILE = path.join(__dirname, 'data', 'match_dates.json');
const MODEL_COEFFS_FILE = path.join(__dirname, 'data', 'model_coeffs.json');
const FEATURE_LOG_FILE = path.join(__dirname, 'data', 'feature_log.json');
const SPORT_HEALTH_FILE = path.join(__dirname, 'data', 'sport_health.json');
const CACHED_ODDS_FILE = path.join(__dirname, 'data', 'cached_odds.json');
const RACING_EVENTS_FILE = path.join(__dirname, 'data', 'racing_events.json');

const HORSE_RACING_API_KEY = process.env.HORSE_RACING_API_KEY || ''; // Reserved for future paid API
const HORSE_RACING_API_BASE = 'https://api.odds-api.net/v1';

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
  { key: 'horse_racing', name: 'Horse Racing', icon: '\uD83C\uDFC7' }
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
  'horse_racing': { hasDraw: false, homeAdv: 1.0, kFactor: 32, formWindow: 3, minConf: 60, maxConf: 92, usePoisson: false, dcRho: 0 }
};
function getCfg(key) { return SPORT_CONFIG[key] || { hasDraw: true, homeAdv: 1.10, kFactor: 32, formWindow: 5, minConf: 68, maxConf: 96, usePoisson: false, dcRho: 0 }; }

const TIERS = {
  free:  { name: 'Free', tipLimit: 3, earlyAccess: false, bankersOnly: false, sportFiltering: false, accaBuilder: false, roiDashboard: false, telegramAlerts: false, monthlyReport: false, horseRacing: false, price: 0 },
  starter: { name: 'Starter', tipLimit: 10, earlyAccess: false, bankersOnly: false, sportFiltering: false, accaBuilder: false, roiDashboard: false, telegramAlerts: true, monthlyReport: false, horseRacing: false, price: 700 },
  pro: { name: 'Pro', tipLimit: 25, earlyAccess: false, bankersOnly: false, sportFiltering: false, accaBuilder: true, roiDashboard: true, telegramAlerts: true, monthlyReport: false, horseRacing: true, price: 2500 },
  elite: { name: 'Elite', tipLimit: 30, earlyAccess: true, bankersOnly: true, sportFiltering: true, accaBuilder: true, roiDashboard: true, telegramAlerts: true, monthlyReport: true, horseRacing: true, price: 6570 }
};

let teamRatings = {};
try { teamRatings = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'team_ratings.json'), 'utf8')); } catch (e) { teamRatings = {}; }
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
let sportHealth = {};  // { sportKey: { recentWins, recentTotal, lastChecked } }
let disabledSports = {}; // { sportKey: true } — auto-disabled if win rate < 40%

const K_FACTOR = 32;
const ELO_BASE = 1500;
const HOME_ADVANTAGE_ELO = 50;

function loadJSON(file, def) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return def; } }
function saveJSON(file, data) { try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch (e) {} }

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
  try { req.user = jwt.verify(header.split(' ')[1], JWT_SECRET); next(); }
  catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
}
function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
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
    const rating = teamRatings[teamName];
    if (rating) { const avg = (rating.attack + rating.defense + rating.form) / 3; eloRatings[sportKey][teamName] = { elo: Math.round(ELO_BASE + (avg - 7) * 100), games: 0 }; }
    else { eloRatings[sportKey][teamName] = { elo: ELO_BASE, games: 0 }; }
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
  if (!formTracker[sportKey] || !formTracker[sportKey][teamName]) return 0;
  const f = formTracker[sportKey][teamName].form;
  if (f.length < 3) return 0;
  const w = f.filter(x => x === 'W').length, l = f.filter(x => x === 'L').length;
  return (w - l) * 8;
}
function getFormWindow(sportKey, team, windowSize) {
  if (!formTracker[sportKey] || !formTracker[sportKey][team]) return null;
  const f = formTracker[sportKey][team].form;
  const recent = f.slice(-windowSize);
  const w = recent.filter(x => x === 'W').length;
  const d = recent.filter(x => x === 'D').length;
  const l = recent.filter(x => x === 'L').length;
  return { wins: w, draws: d, losses: l, total: recent.length, rate: recent.length > 0 ? (w * 3 + d) / (recent.length * 3) : 0.5 };
}

// === ADAPTIVE WEIGHTS (unchanged) ===
function loadWeights() { adaptiveWeights = loadJSON(WEIGHTS_FILE, {}); }
function saveWeights() { saveJSON(WEIGHTS_FILE, adaptiveWeights); }
function getWeights(sportKey) {
  if (!adaptiveWeights[sportKey]) {
    const isSoccer = sportKey.startsWith('soccer_');
    adaptiveWeights[sportKey] = isSoccer ? { eloWeight: 0.25, poissonWeight: 0.40, marketWeight: 0.35, samples: 0 } : { eloWeight: 0.40, poissonWeight: 0, marketWeight: 0.60, samples: 0 };
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
  if (!teamStats[sportKey] || !teamStats[sportKey][team] || teamStats[sportKey][team].matches < 2) {
    const r = getDefaultRating(team);
    return { attack: r.attack, defense: r.defense, form: r.form };
  }
  const s = teamStats[sportKey][team];
  const useHome = isHome && s.homeMatches > 0;
  const relevantMatches = useHome ? s.homeMatches : s.matches;
  const avgGF = useHome ? s.homeGf / s.homeMatches : (s.gf - s.homeGf) / Math.max(1, s.matches - s.homeMatches);
  const avgGA = useHome ? s.homeGa / s.homeMatches : (s.ga - s.homeGa) / Math.max(1, s.matches - s.homeMatches);
  const fMod = formModifier(sportKey, team);
  return { attack: Math.max(3, Math.min(10, 7 + (avgGF - 1.3) * 1.5)), defense: Math.max(3, Math.min(10, 7 + (1.3 - avgGA) * 1.5)), form: 7 + fMod / 8 };
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
function buildSoccerTip(oddsMatch, sport) {
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

  // ML model override if trained
  let mlHomeProb = null;
  if (cfg.usePoisson) {
    const features = buildFeatures(home, away, sport.key);
    const rawLR = predictLR(sport.key, features);
    if (rawLR !== null) mlHomeProb = rawLR;
  }

  // H2H prediction blend
  let pred;
  if (mlHomeProb !== null) {
    const mlAwayProb = 1 - mlHomeProb;
    const blendLR = 0.35;
    pred = { homeWin: mlHomeProb * blendLR + poisson.homeWin * w.poissonWeight + eloHome * w.eloWeight + effectiveMarket.homeWin * w.marketWeight * (1 - blendLR), awayWin: mlAwayProb * blendLR + poisson.awayWin * w.poissonWeight + eloAway * w.eloWeight + effectiveMarket.awayWin * w.marketWeight * (1 - blendLR), draw: cfg.hasDraw ? (poisson.draw * w.poissonWeight + eloDrawVal * w.eloWeight + effectiveMarket.draw * w.marketWeight * (1 - blendLR)) : 0, mlUsed: true };
  } else {
    pred = { homeWin: poisson.homeWin * w.poissonWeight + eloHome * w.eloWeight + effectiveMarket.homeWin * w.marketWeight, awayWin: poisson.awayWin * w.poissonWeight + eloAway * w.eloWeight + effectiveMarket.awayWin * w.marketWeight, draw: cfg.hasDraw ? (poisson.draw * w.poissonWeight + eloDrawVal * w.eloWeight + effectiveMarket.draw * w.marketWeight) : 0, mlUsed: false };
  }
  const totalP = pred.homeWin + pred.awayWin + pred.draw;
  if (totalP > 0) { pred.homeWin /= totalP; pred.awayWin /= totalP; pred.draw /= totalP; }

  const features = buildFeatures(home, away, sport.key);
  const agreement = consensus ? consensus.agreement : 0.5;
  const h2h = getH2H(sport.key, home, away);
  const hForm = getFormWindow(sport.key, home, cfg.formWindow);
  const aForm = getFormWindow(sport.key, away, cfg.formWindow);

  // Reason components
  let rc = [];
  if (pred.mlUsed) rc.push('ML');
  if (cfg.usePoisson) rc.push('Pois+' + poisson.expectedHomeGoals.toFixed(1) + '-' + poisson.expectedAwayGoals.toFixed(1));
  rc.push('Elo ' + Math.round(adjustedElo) + 'v' + Math.round(adjustedEloA));
  if (consensus) rc.push(consensus.totalBooks + 'bk');
  if (h2h) rc.push('H2H' + h2h.total);
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
  var bttsOutcomes = extractMarket(oddsMatch, 'totals'); // reuse totals for BTTS price approximation
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
  const fmHome = formModifier(sport.key, home);
  const adjustedElo = Math.max(1000, Math.min(2000, getElo(sport.key, home) + HOME_ADVANTAGE_ELO + fmHome));
  const fmAway = formModifier(sport.key, away);
  const adjustedEloA = Math.max(1000, Math.min(2000, getElo(sport.key, away) + fmAway));
  const rawElo = expectedScore(adjustedElo, adjustedEloA);
  const eloDrawVal = cfg.hasDraw ? 0.25 : 0;
  const eloHome = rawElo * (1 - eloDrawVal);
  const eloAway = (1 - rawElo) * (1 - eloDrawVal);
  const hR = getDefaultRating(home), aR = getDefaultRating(away);
  const ratingDiff = ((hR.attack + hR.defense + hR.form) - (aR.attack + aR.defense + aR.form)) / 30;
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
  reason = 'AI' + (rawLR !== null ? ' ML' : '') + ' Elo ' + Math.round(adjustedElo) + 'v' + Math.round(adjustedEloA) + formNote + h2hNote + ' ' + consensus.totalBooks + 'books';
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
    if (!hasOdds && !sport.key.startsWith('soccer_')) continue; // only soccer has AI fallback without odds
    if (sport.key === 'soccer_fifa_world_cup' || (!hasOdds && sport.key.startsWith('soccer_'))) {
      var fixtures = await fetchSoccerFixtures();
      if (fixtures.length > 0) {
        for (var fi = 0; fi < fixtures.length; fi++) {
          var m = mapFootballDataFixture(fixtures[fi]);
          var oddsMatch = hasOdds ? cachedOdds[sport.key].find(function(o) { return normalizeTeamName(o.home_team) === normalizeTeamName(m.homeTeam) && normalizeTeamName(o.away_team) === normalizeTeamName(m.awayTeam); }) : null;
          if (oddsMatch) { var tip = buildSoccerTip(oddsMatch, sport); if (tip) allTips.push(tip); }
          else {
            var hR = getDefaultRating(m.homeTeam), aR = getDefaultRating(m.awayTeam);
            var p = dcPoissonPrediction(hR.attack, hR.defense, aR.attack, aR.defense, sport.key);
            var tt = '', conf = 70, o = '2.00', mr = 'Match Result';
            if (p.homeWin > p.awayWin && p.homeWin > p.draw) { tt = m.homeTeam + ' to Win'; conf = Math.min(96, Math.max(68, Math.round(65 + (p.homeWin - 0.40) * 55))); o = p.homeWin > 0.05 ? (1 / p.homeWin).toFixed(2) : '10.00'; }
            else if (p.awayWin > p.homeWin && p.awayWin > p.draw) { tt = m.awayTeam + ' to Win'; conf = Math.min(96, Math.max(68, Math.round(65 + (p.awayWin - 0.40) * 55))); o = p.awayWin > 0.05 ? (1 / p.awayWin).toFixed(2) : '10.00'; }
            else { tt = m.homeTeam + ' or Draw'; mr = 'Double Chance'; var cb = p.homeWin + p.draw; conf = Math.min(93, Math.max(70, Math.round(68 + (cb - 0.55) * 50))); o = cb > 0.05 ? (1 / cb).toFixed(2) : '10.00'; }
            conf = calibrateConfidence(conf);
            var features = buildFeatures(m.homeTeam, m.awayTeam, sport.key);
            allTips.push({ type: sport.key, sport: sport.name, icon: sport.icon, match: m.homeTeam + ' vs ' + m.awayTeam, league: m.league, country: COUNTRY_MAP[sport.key] || '', marketType: 'h2h', market: mr, marketLine: null, kickoff: m.kickoff, pick: tt, odds: o, conf: conf, realOdds: null, bookmaker: '', valueBet: false, reason: 'AI DC-Poisson (' + p.expectedHomeGoals.toFixed(1) + '-' + p.expectedAwayGoals.toFixed(1) + ')', features: features });
          }
        }
      }
      if (hasOdds) {
        for (var oi = 0; oi < cachedOdds[sport.key].length; oi++) { var tip = buildSoccerTip(cachedOdds[sport.key][oi], sport); if (tip) allTips.push(tip); }
      }
    } else if (sport.key.startsWith('soccer_')) {
      for (var oi = 0; oi < cachedOdds[sport.key].length; oi++) { var tip = buildSoccerTip(cachedOdds[sport.key][oi], sport); if (tip) allTips.push(tip); }
    } else {
      for (var oi = 0; oi < cachedOdds[sport.key].length; oi++) { var tip = buildNonSoccerTip(cachedOdds[sport.key][oi], sport); if (tip) allTips.push(tip); }
    }
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
function loadRacingEvents() { cachedRacingEvents = loadJSON(RACING_EVENTS_FILE, []); }
function saveRacingEvents() { saveJSON(RACING_EVENTS_FILE, cachedRacingEvents); }

async function fetchHorseRacing() {
  if (!ODDS_API_KEY) { console.log('[HORSE] No odds API key'); loadRacingEvents(); return; }
  try {
    var res = await fetch(ODDS_API_BASE + '/sports/horse_racing/odds?apiKey=' + ODDS_API_KEY + '&regions=uk,au&markets=h2h');
    if (res.ok) {
      var events = await res.json();
      if (Array.isArray(events) && events.length > 0) {
        cachedRacingEvents = events.map(function(e) {
          var runners = [];
          if (e.bookmakers) {
            for (var bi = 0; bi < e.bookmakers.length; bi++) {
              var bm = e.bookmakers[bi];
              if (!bm.markets) continue;
              var mkt = bm.markets.find(function(m) { return m.key === 'h2h'; });
              if (!mkt || !mkt.outcomes) continue;
              for (var oi = 0; oi < mkt.outcomes.length; oi++) {
                var o = mkt.outcomes[oi];
                if (o.name && o.price && o.price > 1) {
                  var existing = runners.find(function(r) { return r.name === o.name; });
                  if (!existing) { runners.push({ name: o.name, odds: o.price, book: bm.title }); }
                  else if (o.price > existing.odds) { existing.odds = o.price; existing.book = bm.title; }
                }
              }
            }
          }
          return {
            id: e.id || '',
            track: e.sport_title || e.title || 'Horse Racing',
            name: e.home_team || e.title || 'Race',
            time: e.commence_time || '',
            distance: '',
            runners: runners
          };
        }).filter(function(r) { return r.runners.length >= 2; });
        saveRacingEvents();
        console.log('[HORSE] Fetched ' + cachedRacingEvents.length + ' races from odds API');
        return;
      }
    }
    console.log('[HORSE] Odds API returned no horse racing data (HTTP ' + (res.ok ? 'empty' : res.status) + ')');
    loadRacingEvents();
  } catch (e) { console.log('[HORSE] Error: ' + (e.message || e)); loadRacingEvents(); }
}

function buildHorseRacingTip(event) {
  var track = event.track || '';
  var name = event.name || 'Race';
  var dist = event.distance ? ' (' + event.distance + 'm)' : '';
  var time = event.time || event.kickoff || '';
  var runners = event.runners || [];
  if (!runners || runners.length < 2) return null;

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
  if (!pick || bestOdds <= 0) return null;
  var conf = Math.min(cfg.maxConf, Math.max(cfg.minConf, Math.round(bestProb * 100)));
  if (conf < cfg.minConf) return null;
  if (!time || new Date(time).getTime() < Date.now()) return null;
  return {
    type: 'horse_racing', sport: 'Horse Racing', icon: '\uD83C\uDFC7',
    match: (track ? track + ' — ' : '') + name + dist,
    league: track || 'Horse Racing', country: 'International',
    marketType: 'h2h', market: 'Race Winner', marketLine: null,
    kickoff: time, pick: pick + ' to Win', odds: bestOdds.toFixed(2),
    conf: conf, realOdds: null, bookmaker: bestBook, valueBet: false,
    reason: 'AI Horse Racing — Form analysis (' + runners.length + ' runners, favourite)',
    features: [0, 0, 0, 0, 0, 0, 0, 1]
  };
}

// === TELEGRAM BOT (Long Polling) ===
var tgOffset = 0;
var tgPolling = false;

async function sendTelegram(chatId, message) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML', disable_web_page_preview: true })
    });
  } catch (e) {}
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

async function handleTelegramMessage(msg) {
  if (!msg || !msg.text) return;
  var chatId = msg.chat.id;
  var text = msg.text.trim().toLowerCase();
  var subs = loadTelegramSubs();
  var isSub = subs.some(function(s) { return s.chatId === chatId; });

  // /start
  if (text === '/start' || text === '/start@mjk_bettingtips_bot') {
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
  if (text === '/stop' || text === '/stop@mjk_bettingtips_bot') {
    saveTelegramSubs(subs.filter(function(s) { return s.chatId !== chatId; }));
    await sendTelegram(chatId, 'Unsubscribed. Send /start to re-subscribe.');
    return;
  }

  // /help
  if (text === '/help' || text === '/help@mjk_bettingtips_bot') {
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
  if (text === '/tips' || text === '/tips@mjk_bettingtips_bot' || text === 'tips' || text === "today's tips" || text === 'today') {
    var tips = upcomingTips(cachedTips, 10);
    if (tips.length === 0) { await sendTelegram(chatId, 'No upcoming tips right now. Check back later!'); return; }
    var msg = '<b>MJK Tips — Top 10</b>\n\n';
    tips.forEach(function(t, i) { msg += formatTip(t, i + 1) + '\n\n'; });
    msg += 'Confidence min 70% | AI-powered predictions';
    await sendTelegram(chatId, msg);
    return;
  }

  // /bankers
  if (text === '/bankers' || text === '/bankers@mjk_bettingtips_bot' || text === 'bankers') {
    var bankers = upcomingTips(cachedTips.filter(function(t) { return t.conf >= 80; }), 10);
    if (bankers.length === 0) { await sendTelegram(chatId, 'No bankers (80%+) available right now.'); return; }
    var msg = '<b>MJK Bankers — Highest Confidence</b>\n\n';
    bankers.forEach(function(t, i) { msg += formatTip(t, i + 1) + '\n\n'; });
    msg += 'Bankers = 80%+ confidence';
    await sendTelegram(chatId, msg);
    return;
  }

  // /all
  if (text === '/all' || text === '/all@mjk_bettingtips_bot' || text === 'all tips') {
    var tips = upcomingTips(cachedTips, 50);
    if (tips.length === 0) { await sendTelegram(chatId, 'No upcoming tips right now.'); return; }
    var bySport = {};
    tips.forEach(function(t) { if (!bySport[t.sport]) bySport[t.sport] = []; bySport[t.sport].push(t); });
    var msg = '<b>MJK All Tips (' + tips.length + ')</b>\n\n';
    for (var sport in bySport) {
      msg += '<b>' + bySport[sport][0].icon + ' ' + sport + '</b>\n';
      bySport[sport].forEach(function(t, i) { msg += formatTip(t, i + 1) + '\n'; });
      msg += '\n';
    }
    await sendTelegram(chatId, msg);
    return;
  }

  // /sport <name>
  if (text.startsWith('/sport') || text.startsWith('/sport@mjk_bettingtips_bot')) {
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
    var msg = '<b>MJK Tips — ' + tips[0].sport + '</b>\n\n';
    tips.forEach(function(t, i) { msg += formatTip(t, i + 1) + '\n\n'; });
    await sendTelegram(chatId, msg);
    return;
  }

  // /stats
  if (text === '/stats' || text === '/stats@mjk_bettingtips_bot' || text === 'stats' || text === 'performance') {
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
  if (text === '/results' || text === '/results@mjk_bettingtips_bot' || text === 'results') {
    loadTrackedTips();
    var recent = trackedTips.filter(function(t) { return t.result === 'won' || t.result === 'lost'; }).sort(function(a, b) { return (b.checkedAt || '').localeCompare(a.checkedAt || ''); }).slice(0, 10);
    if (recent.length === 0) { await sendTelegram(chatId, 'No completed results yet.'); return; }
    var msg = '<b>MJK Recent Results</b>\n\n';
    recent.forEach(function(t) {
      var icon = t.result === 'won' ? '✅' : '❌';
      msg += icon + ' ' + t.match + '\n   ' + t.pick + ' @ ' + t.odds + ' (' + t.conf + '%)\n\n';
    });
    await sendTelegram(chatId, msg);
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
          await handleTelegramMessage(update.message);
        }
      }
    }
  } catch (e) {
    console.log('[TELEGRAM] Poll error:', e.message || e);
  }
  tgPolling = false;
}

function startTelegramBot() {
  if (!TELEGRAM_BOT_TOKEN) { console.log('[TELEGRAM] No bot token — Telegram bot disabled'); return; }
  console.log('[TELEGRAM] Starting long-polling bot...');
  async function pollLoop() {
    await tgPollOnce();
    setTimeout(pollLoop, 1000);
  }
  pollLoop();
}

// === API ROUTES ===

// Auth
app.post('/api/auth/register', function(req, res) {
  var username = (req.body.username || '').trim().toLowerCase();
  var password = req.body.password || '';
  if (!username || !password || username.length < 3 || password.length < 4) return res.status(400).json({ error: 'Username (3+ chars) and password (4+ chars) required' });
  var users = loadUsers();
  if (users[username]) return res.status(409).json({ error: 'Username taken' });
  users[username] = { id: 'user-' + Date.now(), username: username, password: hashPassword(password), tier: 'free', role: 'user', createdAt: new Date().toISOString(), subs: {} };
  saveUsers(users);
  res.json({ token: generateToken(users[username]), user: { username: username, tier: 'free', role: 'user' } });
});

app.post('/api/auth/login', function(req, res) {
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
app.get('/api/admin/users', authMiddleware, adminMiddleware, function(req, res) {
  var users = loadUsers();
  var list = [];
  for (var u in users) { list.push({ username: u, tier: users[u].tier, role: users[u].role, createdAt: users[u].createdAt }); }
  res.json(list);
});

app.post('/api/admin/set-tier', authMiddleware, adminMiddleware, function(req, res) {
  var users = loadUsers();
  var target = (req.body.username || '').trim().toLowerCase();
  var tier = req.body.tier;
  if (!users[target]) return res.status(404).json({ error: 'User not found' });
  if (!TIERS[tier]) return res.status(400).json({ error: 'Invalid tier. Options: free, starter, pro, elite' });
  users[target].tier = tier;
  saveUsers(users);
  res.json({ success: true, username: target, tier: tier });
});

// Tips (with tier-based limits)
app.get('/api/tips', function(req, res) {
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
app.get('/api/stats', function(req, res) {
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

app.get('/api/history', function(req, res) {
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
  console.log('[AUTH] Password reset requested for ' + username + ' — token: ' + resetToken);
  res.json({ success: true, message: 'Use this reset token: ' + resetToken + ' (valid 1 hour)' });
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
  // Notify admin via Telegram (or fallback to console)
  var msg = '💰 Subscription request: @' + req.user.username + ' wants ' + tier + ' plan (R' + TIERS[tier].price + ')';
  console.log('[SUB] ' + msg);
  if (TELEGRAM_BOT_TOKEN) {
    loadTelegramSubs().forEach(function(s) { sendTelegram(s.chatId, msg); });
  }
  // Auto-upgrade for now — switch this when PayFast is added
  user.tier = tier;
  saveUsers(users);
  res.json({ success: true, tier: tier, message: 'Upgraded to ' + tier + '. Payment integration coming soon.' });
});

const ADMIN_PHONE = '27677834591';

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
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) { console.log('[WHATSAPP] Twilio not configured — skipping'); return false; }
  try {
    var params = new URLSearchParams();
    params.append('From', TWILIO_WHATSAPP_FROM);
    params.append('To', to);
    params.append('Body', body);
    var res = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_ACCOUNT_SID + '/Messages.json', {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + Buffer.from(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    var data = await res.json();
    if (res.ok) { console.log('[WHATSAPP] Sent to ' + to + ' (sid: ' + data.sid + ')'); return true; }
    else { console.log('[WHATSAPP] Failed: ' + (data.message || res.status)); return false; }
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
  var waUrl = 'https://wa.me/' + ADMIN_PHONE + '?text=' + encodeURIComponent(plainMsg);
  saveJSON(path.join(__dirname, 'data', 'last_broadcast.json'), { sentAt: new Date().toISOString(), tipCount: upcoming.length, whatsappDelivered: waSent, message: msg, whatsappUrl: waUrl });
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

app.use(express.static(path.join(__dirname, 'public')));

loadTrackedTips(); loadElo(); loadForm(); loadWeights(); loadCalibration(); loadTeamStats(); loadH2H(); loadMatchDates(); loadModelCoeffs(); loadFeatureLogs(); loadSportHealth(); loadCachedOdds(); loadRacingEvents();
refreshTips();
setInterval(refreshTips, 60000);
setInterval(checkResults, 300000);
setInterval(function() { loadFeatureLogs(); for (var si = 0; si < SPORTS.length; si++) trainSportModel(SPORTS[si].key); }, 1800000);
setInterval(function() { loadTrackedTips(); checkSportHealth(); }, 1800000);

app.listen(port, function() {
  console.log('MJK Betting Tips v9 (Advanced AI + Telegram + WhatsApp Daily Broadcast) running on http://localhost:' + port);
  if (TELEGRAM_BOT_TOKEN) console.log('[TELEGRAM] Bot enabled (long-polling mode)');
  if (TWILIO_ACCOUNT_SID) console.log('[WHATSAPP] Twilio enabled — daily broadcast to ' + ADMIN_WHATSAPP);
  else console.log('[WHATSAPP] Twilio not configured — add TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN to .env');
  console.log('[AUTH] Admin login: ' + ADMIN_USER + ' / ' + ADMIN_PASS);
  console.log('[AI] Dixon-Coles Poisson, logistic regression, per-sport config, team stats, H2H, fatigue tracking loaded');
  startTelegramBot();
  scheduleDailyBroadcast();
  setTimeout(function() { console.log('[AI] Initial model training starting...'); loadTrackedTips(); trainAllModels(); checkSportHealth(); }, 5000);
});
