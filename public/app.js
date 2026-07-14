/* ============================================
   MJK BETTING TIPS — Industrial Standard JS
   ============================================ */

var SAST = 7200000;
var ALL_TIPS = [];
var BANKERS = [];
var SPORTS = [];
var currentTab = 'all';
var currentConfFilter = 'all';
var accaSelections = {};
var lastDate = '';
var authToken = localStorage.getItem('mjk_token') || null;
var currentUser = null;
var TIERS = {};
var chartInstances = {};
var sessionStartTime = Date.now();
var realityCheckShown = false;

// === UTILS ===
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function nowSAST() { return new Date(Date.now() + SAST); }
function todayKey() { var d = nowSAST(); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth()+1) + '-' + pad(d.getUTCDate()); }
function formatTime(isoUTC) {
  if (!isoUTC) return '';
  var ms = new Date(isoUTC).getTime();
  var sd = new Date(ms + SAST);
  var nd = nowSAST();
  var mDay = Date.UTC(sd.getUTCFullYear(),sd.getUTCMonth(),sd.getUTCDate());
  var nDay = Date.UTC(nd.getUTCFullYear(),nd.getUTCMonth(),nd.getUTCDate());
  var diff = Math.round((mDay - nDay) / 86400000);
  var t = pad(sd.getUTCHours()) + ':' + pad(sd.getUTCMinutes());
  var DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var lbl = diff===0?'Today':diff===1?'Tomorrow':diff===-1?'Yesterday':DAYS[sd.getUTCDay()]+' '+sd.getUTCDate()+' '+MONTHS[sd.getUTCMonth()];
  return lbl + ' · ' + t + ' SAST';
}
function isPast(iso) { return iso && new Date(iso).getTime() < Date.now(); }
function cc(conf) { if (conf >= 85) return '#00e676'; if (conf >= 75) return '#00c8ff'; return '#f0b429'; }
function esc(str) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

// === TOAST SYSTEM ===
function showToast(msg, type, duration) {
  type = type || 'info';
  duration = duration || 4000;
  var container = document.getElementById('toastContainer');
  if (!container) return;
  var icons = { success: '✓', error: '✗', info: 'ℹ' };
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = '<span class="toast-icon">' + (icons[type]||'ℹ') + '</span><span class="toast-msg">' + msg + '</span><button class="toast-close" onclick="this.parentElement.remove()" aria-label="Close">&times;</button>';
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.animation = 'toastOut .3s ease forwards';
    setTimeout(function() { if (toast.parentElement) toast.remove(); }, 300);
  }, duration);
}

// === API ===
function apiHeaders() {
  var h = { 'Content-Type': 'application/json' };
  if (authToken) h['Authorization'] = 'Bearer ' + authToken;
  return h;
}
function handleExpired(d) {
  if (d.error === 'Invalid token' || d.error === 'Unauthorized') {
    authToken = null; localStorage.removeItem('mjk_token'); currentUser = null; updateAuthUI();
    showToast('Session expired. Please login again.', 'error');
    return true;
  }
  return false;
}
function apiGet(url) {
  return fetch(url, { headers: apiHeaders() }).then(function(r) { return r.json(); }).then(function(d) { handleExpired(d); return d; });
}
function apiPost(url, body) {
  return fetch(url, { method: 'POST', headers: apiHeaders(), body: JSON.stringify(body || {}) }).then(function(r) { return r.json(); }).then(function(d) { handleExpired(d); return d; });
}

// === THEME ===
function toggleTheme() {
  var html = document.documentElement;
  var current = html.getAttribute('data-theme');
  var next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('mjk_theme', next);
  document.getElementById('themeIcon').textContent = next === 'dark' ? '☀️' : '🌙';
  if (next === 'dark') {
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#00c8ff');
  } else {
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0080cc');
  }
  // Re-render charts with new theme colors
  Object.keys(chartInstances).forEach(function(k) { if (chartInstances[k]) chartInstances[k].destroy(); });
  chartInstances = {};
  if (currentUser && currentUser.role === 'admin') loadAdminStats();
  var ds = document.getElementById('section-dashboard');
  if (ds && ds.style.display !== 'none') loadDashboard();
  var hs = document.getElementById('historyWrap');
  if (hs && hs.children.length > 0) renderHistoryChart();
}
function loadTheme() {
  var saved = localStorage.getItem('mjk_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    var icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = saved === 'dark' ? '☀️' : '🌙';
  }
}

// === AUTH ===
function loadAuth() {
  if (!authToken) return;
  apiGet('/api/auth/me').then(function(d) {
    if (d.error) { authToken = null; localStorage.removeItem('mjk_token'); currentUser = null; updateAuthUI(); return; }
    currentUser = d;
    updateAuthUI();
    loadTiers();
    checkAdmin();
    checkApiKeyAccess();
  }).catch(function() {});
}
function updateAuthUI() {
  var loginBtn = document.getElementById('loginBtn');
  var registerBtn = document.getElementById('registerBtn');
  var userMenu = document.getElementById('userMenu');
  var bottomAuthBtn = document.getElementById('bottomAuthBtn');
  if (currentUser) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (registerBtn) registerBtn.style.display = 'none';
    if (userMenu) { userMenu.style.display = ''; document.getElementById('userName').textContent = currentUser.username; }
    if (bottomAuthBtn) { bottomAuthBtn.querySelector('span').textContent = currentUser.username; bottomAuthBtn.onclick = function() { showSection('dashboard'); }; }
    var badge = document.getElementById('userTierBadge');
    if (badge) { badge.textContent = currentUser.tier.charAt(0).toUpperCase() + currentUser.tier.slice(1); badge.className = 'tier-badge tier-' + currentUser.tier; }
    var header = document.getElementById('dropdownHeader');
    if (header) header.textContent = currentUser.username + ' — ' + (currentUser.tier.charAt(0).toUpperCase() + currentUser.tier.slice(1));
    var note = document.getElementById('tipLimitNote');
    if (note) {
      if (currentUser.tier === 'free') note.innerHTML = '3 free tips shown. <a href="#" onclick="showAuthModal(\'register\')" style="color:var(--cyan)">Register</a> for more tips.';
      else note.innerHTML = currentUser.tier.charAt(0).toUpperCase() + currentUser.tier.slice(1) + ' plan — showing ' + (TIERS[currentUser.tier] ? TIERS[currentUser.tier].tipLimit : 'all') + ' tips.';
    }
  } else {
    if (loginBtn) loginBtn.style.display = '';
    if (registerBtn) registerBtn.style.display = '';
    if (userMenu) userMenu.style.display = 'none';
    if (bottomAuthBtn) { bottomAuthBtn.querySelector('span').textContent = 'Login'; bottomAuthBtn.onclick = function() { showAuthModal('login'); }; }
    var note = document.getElementById('tipLimitNote');
    if (note) note.innerHTML = '3 free tips shown. <a href="#" onclick="showAuthModal(\'register\')" style="color:var(--cyan)">Register</a> for more tips.';
  }
}
function checkAdmin() {
  var el = document.getElementById('adminMenuItem');
  var navEl = document.getElementById('navAdmin');
  var bottomEl = document.getElementById('bottomAdmin');
  var isAdmin = currentUser && currentUser.role === 'admin';
  if (el) el.style.display = isAdmin ? 'block' : 'none';
  if (navEl) navEl.style.display = isAdmin ? '' : 'none';
  if (bottomEl) bottomEl.style.display = isAdmin ? '' : 'none';
}
function checkApiKeyAccess() {
  var el = document.getElementById('apiKeyMenuItem');
  if (el) el.style.display = (currentUser && currentUser.tier === 'elite') ? 'block' : 'none';
}
function toggleUserDropdown() {
  var dd = document.getElementById('userDropdown');
  var um = document.getElementById('userMenu');
  if (dd) dd.classList.toggle('open');
  if (um) um.classList.toggle('open');
}
var _closeAuthTimer = null;
function showAuthModal(mode) {
  if (_closeAuthTimer) { clearTimeout(_closeAuthTimer); _closeAuthTimer = null; }
  var m = document.getElementById('authModal');
  if (!m) return;
  m.style.display = '';
  m.classList.add('open');
  document.getElementById('authTitle').textContent = mode === 'login' ? 'Login' : 'Register';
  document.getElementById('authBtn').textContent = mode === 'login' ? 'Login' : 'Register';
  document.getElementById('authBtn').setAttribute('data-mode', mode);
  document.getElementById('authError').textContent = '';
  document.getElementById('authUsername').value = '';
  document.getElementById('authPassword').value = '';
  document.getElementById('authFormDefault').style.display = 'block';
  document.getElementById('authFormForgot').style.display = 'none';
  closeDropdown();
  setTimeout(function() { document.getElementById('authUsername').focus(); }, 300);
}
function showForgotPassword() {
  document.getElementById('authFormDefault').style.display = 'none';
  document.getElementById('authFormForgot').style.display = 'block';
  document.getElementById('forgotUsername').value = '';
  document.getElementById('forgotToken').value = '';
  document.getElementById('forgotNewPassword').value = '';
  document.getElementById('forgotStep2').style.display = 'none';
  document.getElementById('forgotError').textContent = '';
  document.getElementById('forgotSuccess').style.display = 'none';
  document.getElementById('forgotBtn').textContent = 'Send Reset';
}
function handleForgot() {
  var username = document.getElementById('forgotUsername').value.trim();
  var token = document.getElementById('forgotToken').value.trim();
  var password = document.getElementById('forgotNewPassword').value;
  var btn = document.getElementById('forgotBtn');
  var err = document.getElementById('forgotError');
  var success = document.getElementById('forgotSuccess');
  err.textContent = '';
  if (!username) { err.textContent = 'Enter your username.'; return; }
  if (!token) {
    btn.disabled = true; btn.textContent = 'Sending...';
    fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username }) })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        btn.disabled = false; btn.textContent = 'Send Reset';
        if (d.error) { err.textContent = d.error; return; }
        success.style.display = 'block'; success.textContent = d.message;
        document.getElementById('forgotStep2').style.display = 'block';
        btn.textContent = 'Reset Password';
      }).catch(function() { btn.disabled = false; btn.textContent = 'Send Reset'; err.textContent = 'Network error'; });
  } else {
    if (!password || password.length < 4) { err.textContent = 'Password must be 4+ characters.'; return; }
    btn.disabled = true; btn.textContent = 'Resetting...';
    fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username, token: token, password: password }) })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        btn.disabled = false;
        if (d.error) { err.textContent = d.error; btn.textContent = 'Reset Password'; return; }
        success.textContent = 'Password reset! You can now login.';
        btn.textContent = 'Done';
        document.getElementById('forgotToken').value = '';
        document.getElementById('forgotNewPassword').value = '';
        showToast('Password reset successfully!', 'success');
        showAuthModal('login');
      }).catch(function() { btn.disabled = false; btn.textContent = 'Reset Password'; err.textContent = 'Network error'; });
  }
}
function closeAuth() {
  var m = document.getElementById('authModal');
  var oddsContent = document.getElementById('oddsCompareContent');
  if (oddsContent) oddsContent.remove();
  if (m) {
    m.classList.remove('open');
    m.style.display = '';
  }
}
function handleAuth() {
  var username = document.getElementById('authUsername').value.trim();
  var password = document.getElementById('authPassword').value;
  var mode = document.getElementById('authBtn').getAttribute('data-mode');
  var endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
  var errEl = document.getElementById('authError');
  var btn = document.getElementById('authBtn');
  btn.disabled = true; btn.textContent = mode === 'login' ? 'Logging in...' : 'Registering...';
  fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username, password: password }) })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      btn.disabled = false; btn.textContent = mode === 'login' ? 'Login' : 'Register';
      if (d.error) { errEl.textContent = d.error; return; }
      authToken = d.token;
      localStorage.setItem('mjk_token', d.token);
      currentUser = d.user;
      closeAuth();
      updateAuthUI();
      loadTiers();
      checkAdmin();
      checkApiKeyAccess();
      fetchTiers();
      showToast('Welcome, ' + d.user.username + '!', 'success');
      startSessionTimer();
      requestPushNotification();
    })
    .catch(function() { btn.disabled = false; btn.textContent = mode === 'login' ? 'Login' : 'Register'; errEl.textContent = 'Network error'; });
}
function logout() {
  authToken = null;
  localStorage.removeItem('mjk_token');
  currentUser = null;
  updateAuthUI();
  closeDropdown();
  document.getElementById('premiumContent').style.display = 'none';
  showSection('tips');
  stopSessionTimer();
  showToast('Logged out.', 'info');
}
function closeDropdown() {
  var dd = document.getElementById('userDropdown');
  var um = document.getElementById('userMenu');
  if (dd) dd.classList.remove('open');
  if (um) um.classList.remove('open');
}

// === SESSION TIMER / REALITY CHECK ===
var sessionInterval = null;
function startSessionTimer() {
  var timerEl = document.getElementById('sessionTimer');
  if (timerEl) timerEl.style.display = '';
  sessionStartTime = Date.now();
  realityCheckShown = false;
  sessionInterval = setInterval(function() {
    var elapsed = Math.floor((Date.now() - sessionStartTime) / 60000);
    var h = Math.floor(elapsed / 60);
    var m = elapsed % 60;
    var display = h > 0 ? h + ':' + pad(m) : '0:' + pad(m);
    var el = document.getElementById('sessionTime');
    if (el) el.textContent = display;
    // Reality check every 60 minutes
    if (elapsed > 0 && elapsed % 60 === 0 && !realityCheckShown) {
      realityCheckShown = true;
      showRealityCheck();
      setTimeout(function() { realityCheckShown = false; }, 120000);
    }
  }, 60000);
}
function stopSessionTimer() {
  if (sessionInterval) clearInterval(sessionInterval);
  var timerEl = document.getElementById('sessionTimer');
  if (timerEl) timerEl.style.display = 'none';
}
function showRealityCheck() {
  var elapsed = Math.floor((Date.now() - sessionStartTime) / 60000);
  var el = document.getElementById('rcSessionTime');
  if (el) el.textContent = elapsed + ' minutes';
  var modal = document.getElementById('realityModal');
  if (modal) modal.classList.add('open');
}

// === PUSH NOTIFICATIONS ===
function requestPushNotification() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    registerPushSubscription();
    return;
  }
  var dismissed = localStorage.getItem('mjk_push_dismissed');
  if (dismissed) return;
  var prompt = document.getElementById('pushPrompt');
  if (prompt) setTimeout(function() { prompt.style.display = 'flex'; }, 5000);
}
function registerPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  fetch('/api/vapid-key').then(function(r) { return r.json(); }).then(function(data) {
    if (!data.key) return;
    var key = data.key;
    var padding = '='.repeat((4 - key.length % 4) % 4);
    var base64 = (key + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = Uint8Array.from(atob(base64), function(c) { return c.charCodeAt(0); });
    navigator.serviceWorker.ready.then(function(reg) {
      reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw }).then(function(sub) {
        apiPost('/api/push/subscribe', sub.toJSON()).catch(function() {});
      }).catch(function() {});
    }).catch(function() {});
  }).catch(function() {});
}
function enablePushNotifications() {
  if (!('Notification' in window)) { showToast('Notifications not supported in this browser', 'error'); return; }
  Notification.requestPermission().then(function(perm) {
    if (perm === 'granted') {
      showToast('Notifications enabled!', 'success');
      registerPushSubscription();
    } else {
      showToast('Notifications blocked — you can enable them in browser settings', 'info');
    }
    dismissPushPrompt();
  });
}
function dismissPushPrompt() {
  var prompt = document.getElementById('pushPrompt');
  if (prompt) prompt.style.display = 'none';
  localStorage.setItem('mjk_push_dismissed', '1');
}

// === TIERS ===
function loadTiers() {
  if (!currentUser) return;
  var badge = document.getElementById('userTierBadge');
  if (badge) { badge.textContent = currentUser.tier.charAt(0).toUpperCase() + currentUser.tier.slice(1); badge.className = 'tier-badge tier-' + currentUser.tier; }
  checkApiKeyAccess();
}
function fetchTiers() {
  apiGet('/api/tiers').then(function(d) {
    TIERS = d;
    renderTiers();
    renderPremiumPlans();
  }).catch(function() {});
}

// === SECTIONS ===
function showSection(name) {
  closeDropdown();
  var sections = ['tips','dashboard','premium','api-keys','admin'];
  for (var i = 0; i < sections.length; i++) {
    var el = document.getElementById('section-' + sections[i]);
    if (el) el.style.display = sections[i] === name ? '' : 'none';
  }
  // Update nav active state
  document.querySelectorAll('.nav-link').forEach(function(l) { l.classList.remove('active'); });
  document.querySelectorAll('.bottom-nav-item').forEach(function(b) { b.classList.remove('active'); });
  var navLinks = document.querySelectorAll('.nav-link');
  var bottomItems = document.querySelectorAll('.bottom-nav-item');
  for (var i = 0; i < navLinks.length; i++) {
    if (navLinks[i].textContent.toLowerCase().indexOf(name) !== -1 || (name === 'tips' && navLinks[i].textContent === 'Tips')) navLinks[i].classList.add('active');
  }
  for (var i = 0; i < bottomItems.length; i++) {
    if (bottomItems[i].getAttribute('data-section') === name) bottomItems[i].classList.add('active');
  }
  if (name === 'dashboard') loadDashboard();
  if (name === 'api-keys') loadApiKey();
  if (name === 'admin') { loadAdminUsers(); loadAdminStats(); loadBacktest(); loadAdminVisitors(); }
  if (name === 'premium') loadPremiumContent();
}

// === DASHBOARD ===
function loadDashboard() {
  apiGet('/api/stats').then(function(d) {
    var tr = d.total;
    document.getElementById('dashWinRate').textContent = tr.winRate + '%';
    document.getElementById('dashTotalBets').textContent = tr.won + tr.lost;
    document.getElementById('dashROI').textContent = '-';
    document.getElementById('dashProfit').textContent = '-';
    renderDashboardChart(d);
  }).catch(function() {});
  apiGet('/api/history').then(function(d) {
    var el = document.getElementById('dashboardTips');
    if (!el) return;
    if (!d.tips || d.tips.length === 0) { el.innerHTML = '<div class="empty-state">No completed tips yet.</div>'; return; }
    el.innerHTML = d.tips.slice(0, 20).map(function(t) {
      var badge = t.result === 'won' ? '<span class="result-badge result-won">WON</span>' : '<span class="result-badge result-lost">LOST</span>';
      return '<div class="hist-card"><div class="hist-top"><span class="hist-match">' + t.match + '</span><span class="hist-odds">' + t.odds + '</span></div><div class="hist-pick">' + t.pick + ' ' + badge + '</div><div class="hist-meta">' + t.sport + ' · Conf: ' + t.conf + '%' + (t.kickoff ? ' · ' + formatTime(t.kickoff) : '') + '</div></div>';
    }).join('');
  }).catch(function() {});
}

// === CHARTS ===
var chartColors = { blue: '#00c8ff', purple: '#b44fff', green: '#00e676', red: '#ff3d57', gold: '#f0b429' };
function getChartTextColor() { return document.documentElement.getAttribute('data-theme') === 'light' ? '#1a2030' : '#e0eaff'; }
function getChartGridColor() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.08)'; }
function renderDashboardChart(data) {
  if (typeof Chart === 'undefined') return;
  var wrap = document.getElementById('dashboardChartWrap');
  if (!wrap) return;
  if (!data.sports || data.sports.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  if (chartInstances.dashboard) chartInstances.dashboard.destroy();
  var labels = data.sports.filter(function(s) { return s.total > 0; }).map(function(s) { return s.sport.split(' ')[0]; });
  var wonData = data.sports.filter(function(s) { return s.total > 0; }).map(function(s) { return s.won; });
  var lostData = data.sports.filter(function(s) { return s.total > 0; }).map(function(s) { return s.lost; });
  var ctx = document.getElementById('dashboardChart').getContext('2d');
  chartInstances.dashboard = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Won', data: wonData, backgroundColor: chartColors.green + '88', borderRadius: 6 },
        { label: 'Lost', data: lostData, backgroundColor: chartColors.red + '88', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { labels: { color: getChartTextColor() } } },
      scales: {
        x: { ticks: { color: getChartTextColor() }, grid: { color: getChartGridColor() } },
        y: { ticks: { color: getChartTextColor(), stepSize: 1 }, grid: { color: getChartGridColor() }, beginAtZero: true }
      }
    }
  });
}
function renderHistoryChart() {
  if (typeof Chart === 'undefined') return;
  apiGet('/api/history').then(function(d) {
    if (!d.tips || d.tips.length === 0) return;
    if (chartInstances.history) chartInstances.history.destroy();
    var won = d.tips.filter(function(t) { return t.result === 'won'; }).length;
    var lost = d.tips.filter(function(t) { return t.result === 'lost'; }).length;
    var ctx = document.getElementById('historyChart');
    if (!ctx) return;
    chartInstances.history = new Chart(ctx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Won', 'Lost'],
        datasets: [{ data: [won, lost], backgroundColor: [chartColors.green, chartColors.red], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: true, cutout: '65%',
        plugins: { legend: { position: 'bottom', labels: { color: getChartTextColor(), padding: 16 } } }
      }
    });
  }).catch(function() {});
}

// === ADMIN CHARTS ===
function renderAdminCharts(stats) {
  if (typeof Chart === 'undefined') return;
  // User distribution pie
  if (chartInstances.adminUser) chartInstances.adminUser.destroy();
  var t = stats.tiers || {};
  var userCtx = document.getElementById('adminUserChart');
  if (userCtx) {
    chartInstances.adminUser = new Chart(userCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Free', 'Starter', 'Pro', 'Elite'],
        datasets: [{ data: [t.free||0, t.starter||0, t.pro||0, t.elite||0], backgroundColor: ['#5a6a90', chartColors.blue, chartColors.gold, chartColors.purple], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: true, cutout: '60%',
        plugins: { legend: { position: 'bottom', labels: { color: getChartTextColor(), padding: 12 } }, title: { display: true, text: 'User Distribution by Tier', color: getChartTextColor() } }
      }
    });
  }
  // Win rate bar
  if (chartInstances.adminWin) chartInstances.adminWin.destroy();
  var winCtx = document.getElementById('adminWinChart');
  if (winCtx) {
    chartInstances.adminWin = new Chart(winCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Won', 'Lost', 'Pending'],
        datasets: [{ data: [stats.wonTips||0, stats.lostTips||0, stats.pendingTips||0], backgroundColor: [chartColors.green+'88', chartColors.red+'88', chartColors.blue+'44'], borderRadius: 8 }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false }, title: { display: true, text: 'Tip Results Overview', color: getChartTextColor() } },
        scales: {
          x: { ticks: { color: getChartTextColor() }, grid: { display: false } },
          y: { ticks: { color: getChartTextColor(), stepSize: 1 }, grid: { color: getChartGridColor() }, beginAtZero: true }
        }
      }
    });
  }
}

// === PREMIUM ===
function loadPremiumContent() {
  var content = document.getElementById('premiumContent');
  var tools = document.getElementById('premiumTools');
  if (!currentUser || currentUser.tier === 'free') { content.style.display = 'none'; return; }
  content.style.display = 'block';
  var html = '';
  var tierInfo = TIERS[currentUser.tier];
  if (!tierInfo) { tools.innerHTML = '<p style="color:var(--muted)">Loading...</p>'; return; }
  if (tierInfo.accaBuilder) { html += '<div class="premium-tool"><div class="tool-icon">📊</div><div><div class="tool-title">Acca Builder</div><div class="tool-desc">Build accumulators from tips below.</div></div></div>'; }
  if (tierInfo.roiDashboard) { html += '<div class="premium-tool" onclick="showSection(\'dashboard\')" style="cursor:pointer"><div class="tool-icon">📈</div><div><div class="tool-title">ROI Dashboard</div><div class="tool-desc">Track your betting performance.</div></div></div>'; }
  if (tierInfo.sportFiltering) { html += '<div class="premium-tool"><div class="tool-icon">⚙️</div><div><div class="tool-title">Sport Filtering</div><div class="tool-desc">Select which sports to show.</div></div></div>'; }
  if (tierInfo.monthlyReport) { html += '<div class="premium-tool" onclick="loadMonthlyReport()" style="cursor:pointer"><div class="tool-icon">📄</div><div><div class="tool-title">Monthly Report</div><div class="tool-desc">Detailed monthly performance.</div></div></div>'; }
  if (tierInfo.telegramAlerts) { html += '<div class="premium-tool"><div class="tool-icon">✈️</div><div><div class="tool-title">Telegram Alerts</div><div class="tool-desc">Live tip notifications.</div></div></div>'; }
  tools.innerHTML = html || '<p style="color:var(--muted)">No additional tools for your plan.</p>';
  if (tierInfo.sportFiltering) loadSportFilter();
}
function loadMonthlyReport() {
  var tools = document.getElementById('premiumTools');
  apiGet('/api/premium/report').then(function(d) {
    var html = '<div class="monthly-report" style="background:var(--bg2);border-radius:12px;padding:16px;margin-top:12px;">';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;"><span style="color:var(--muted);font-size:12px;">Month: ' + d.month + '</span><span style="font-size:12px;">Total: ' + d.total + ' tips</span></div>';
    html += '<div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">';
    html += '<div class="dash-card" style="flex:1;min-width:80px;"><div class="dash-label">Win Rate</div><div class="dash-value">' + d.winRate + '%</div></div>';
    html += '<div class="dash-card" style="flex:1;min-width:80px;"><div class="dash-label">Won</div><div class="dash-value" style="color:var(--green)">' + d.won + '</div></div>';
    html += '<div class="dash-card" style="flex:1;min-width:80px;"><div class="dash-label">Lost</div><div class="dash-value" style="color:var(--red)">' + d.lost + '</div></div>';
    html += '<div class="dash-card" style="flex:1;min-width:80px;"><div class="dash-label">ROI</div><div class="dash-value">' + d.roi + '%</div></div></div>';
    html += '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">By Sport:</div>';
    for (var sk in d.bySport) {
      var s = d.bySport[sk];
      html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--bg3);margin:2px 0;border-radius:4px;font-size:12px;"><span>' + sk + '</span><span><span style="color:var(--green)">' + s.won + 'W</span> / <span style="color:var(--red)">' + s.lost + 'L</span></span></div>';
    }
    html += '</div>';
    tools.insertAdjacentHTML('afterend', html);
  }).catch(function() {});
}
function loadSportFilter() {
  var section = document.getElementById('sportFilterSection');
  var grid = document.getElementById('sportFilterGrid');
  if (!section || !grid) return;
  section.style.display = 'block';
  apiGet('/api/premium/sport-prefs').then(function(d) {
    var prefs = d.prefs || {};
    var html = '';
    for (var i = 0; i < SPORTS.length; i++) {
      var s = SPORTS[i];
      var enabled = prefs[s.key] !== false;
      html += '<label class="filter-chip" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px 14px;border-radius:20px;border:1px solid ' + (enabled ? 'var(--green)' : 'var(--border)') + ';" data-sport="' + s.key + '"><input type="checkbox" ' + (enabled ? 'checked' : '') + ' style="accent-color:var(--green);width:14px;height:14px;" onchange="toggleSportPref(\'' + s.key + '\',this.checked)">' + (s.icon || '') + ' ' + (s.name || s.key) + '</label>';
    }
    grid.innerHTML = html;
  }).catch(function() {});
}
function toggleSportPref(sportKey, enabled) {
  apiPost('/api/premium/sport-prefs', { sport: sportKey, enabled: enabled }).catch(function() {});
}

// === ADMIN ===
var ALL_ADMIN_USERS = [];
function loadAdminUsers() {
  apiGet('/api/admin/users').then(function(d) {
    if (d.error) return;
    ALL_ADMIN_USERS = d.users || [];
    renderAdminUsers(ALL_ADMIN_USERS);
  }).catch(function() {});
}
function renderAdminUsers(users) {
  var html = '';
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var safeName = u.username.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    var safeTier = u.tier.replace(/[^a-z]/g, '');
    var roleIcon = u.role === 'admin' ? '<span style="margin-right:4px;">&#x1F451;</span>' : '';
    var created = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-ZA') : '';
    var expiryNote = '';
    if (u.subscriptionExpiresAt && u.tier !== 'free') {
      var expDate = new Date(u.subscriptionExpiresAt);
      var daysLeft = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / 86400000));
      expiryNote = '<span style="color:' + (daysLeft <= 2 ? 'var(--red)' : 'var(--muted)') + ';font-size:10px;">' + daysLeft + 'd left</span>';
    }
    html += '<div class="admin-user-row" onclick="selectAdminUser(\'' + safeName + '\',\'' + safeTier + '\')">' +
      '<div style="display:flex;align-items:center;gap:8px;min-width:0;"><span style="font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + roleIcon + safeName + '</span> <span class="tier-badge tier-' + safeTier + '">' + safeTier + '</span></div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">' + expiryNote + '<span style="color:var(--muted);font-size:11px;">' + created + '</span>' +
      '<select class="admin-select" style="padding:4px 8px;font-size:11px;min-height:auto;" onclick="event.stopPropagation()" onchange="quickSetTier(\'' + safeName + '\',this.value)">' +
      '<option value="free"' + (u.tier === 'free' ? ' selected' : '') + '>Free</option>' +
      '<option value="starter"' + (u.tier === 'starter' ? ' selected' : '') + '>Starter</option>' +
      '<option value="pro"' + (u.tier === 'pro' ? ' selected' : '') + '>Pro</option>' +
      '<option value="elite"' + (u.tier === 'elite' ? ' selected' : '') + '>Elite</option>' +
      '</select></div></div>';
  }
  if (users.length === 0) html = '<div class="empty-state">No users found</div>';
  document.getElementById('adminUserList').innerHTML = html;
}
function filterAdminUsers() {
  var q = document.getElementById('adminSearchUser').value.toLowerCase();
  var filtered = ALL_ADMIN_USERS.filter(function(u) { return u.username.toLowerCase().indexOf(q) >= 0; });
  renderAdminUsers(filtered);
}
function selectAdminUser(username, tier) {
  document.getElementById('adminTargetUser').value = username;
  document.getElementById('adminTargetTier').value = tier;
}
function quickSetTier(username, tier) {
  apiPost('/api/admin/set-tier', { username: username, tier: tier }).then(function(d) {
    if (d.error) { showToast(d.error, 'error'); return; }
    showToast(username + ' → ' + tier, 'success');
    loadAdminUsers();
  }).catch(function() { showToast('Network error', 'error'); });
}
function adminSetTier() {
  var username = document.getElementById('adminTargetUser').value.trim();
  var tier = document.getElementById('adminTargetTier').value;
  if (!username) { showToast('Enter a username', 'error'); return; }
  apiPost('/api/admin/set-tier', { username: username, tier: tier }).then(function(d) {
    if (d.error) { showToast(d.error, 'error'); return; }
    showToast(username + ' upgraded to ' + tier, 'success');
    loadAdminUsers();
  }).catch(function() { showToast('Network error', 'error'); });
}
function adminDeleteUser() {
  var username = document.getElementById('adminTargetUser').value.trim();
  if (!username) { showToast('Enter a username', 'error'); return; }
  if (!confirm('Delete user ' + username + '? This cannot be undone.')) return;
  apiPost('/api/admin/delete-user', { username: username }).then(function(d) {
    if (d.error) { showToast(d.error, 'error'); return; }
    showToast(username + ' deleted', 'success');
    loadAdminUsers();
  }).catch(function() { showToast('Network error', 'error'); });
}
function loadAdminStats() {
  apiGet('/api/admin/stats').then(function(d) {
    if (d.error) return;
    var el = function(id) { return document.getElementById(id); };
    if (el('adminTotalUsers')) el('adminTotalUsers').textContent = d.totalUsers || 0;
    if (el('adminWinRate')) el('adminWinRate').textContent = (d.winRate || '0') + '%';
    if (el('adminTotalTips')) el('adminTotalTips').textContent = d.totalTips || 0;
    if (el('adminTgSubs')) el('adminTgSubs').textContent = d.telegramSubs || 0;
    if (el('adminFreeCount')) el('adminFreeCount').textContent = d.tiers ? (d.tiers.free || 0) : 0;
    if (el('adminProCount')) el('adminProCount').textContent = d.tiers ? ((d.tiers.pro || 0) + (d.tiers.starter || 0)) : 0;
    if (el('adminEliteCount')) el('adminEliteCount').textContent = d.tiers ? (d.tiers.elite || 0) : 0;
    if (el('adminPending')) el('adminPending').textContent = d.pendingTips || 0;
    renderAdminCharts(d);
  }).catch(function() {});
}

// === VISITOR TRACKING ===
function trackVisit() {
  try {
    var payload = { page: window.location.pathname + window.location.search };
    if (currentUser && currentUser.username) payload.username = currentUser.username;
    if (navigator.sendBeacon) {
      var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/track', blob);
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
  } catch (e) {}
}
function loadAdminVisitors() {
  apiGet('/api/admin/visitors').then(function(d) {
    if (d.error) return;
    var summary = document.getElementById('adminVisitorSummary');
    var list = document.getElementById('adminVisitorList');
    if (!summary || !list) return;
    summary.innerHTML = '<div class="admin-stat-card"><div class="admin-stat-num">' + (d.uniqueCount || 0) + '</div><div class="admin-stat-label">Unique Visitors</div></div>' +
      '<div class="admin-stat-card"><div class="admin-stat-num">' + (d.totalVisits || 0) + '</div><div class="admin-stat-label">Total Visits</div></div>';
    var html = '<div class="visitor-devices-row">';
    if (d.devices) { for (var dev in d.devices) html += '<span class="visitor-chip">' + dev + ': ' + d.devices[dev] + '</span>'; }
    if (d.browsers) { for (var br in d.browsers) html += '<span class="visitor-chip">' + br + ': ' + d.browsers[br] + '</span>'; }
    html += '</div>';
    var visitors = d.visitors || [];
    html += '<table class="visitor-table"><thead><tr><th>IP</th><th>Device</th><th>Browser</th><th>User</th><th>Visits</th><th>Last Seen</th></tr></thead><tbody>';
    for (var i = 0; i < Math.min(visitors.length, 50); i++) {
      var v = visitors[i];
      var ts = v.lastSeen ? new Date(v.lastSeen).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      html += '<tr><td>' + (v.ip || '') + '</td><td>' + (v.device || '') + '</td><td>' + (v.browser || '') + '</td><td>' + (v.username || '-') + '</td><td>' + (v.visits || 1) + '</td><td>' + ts + '</td></tr>';
    }
    html += '</tbody></table>';
    if (visitors.length === 0) html = '<div class="empty-state">No visitors yet</div>';
    list.innerHTML = html;
  }).catch(function() {});
}

function loadBacktest() {
  var el = document.getElementById('backtestPanel');
  if (el) el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);">Running backtest...</div>';
  apiGet('/api/backtest').then(function(d) {
    if (!el) return;
    if (d.error) { el.innerHTML = '<p style="color:var(--red)">' + d.error + '</p>'; return; }
    var html = '';
    html += '<div style="background:var(--bg2);padding:12px;border-radius:8px;margin-bottom:12px;"><b>Overall:</b> ' + d.overall.total + ' tips | ' + d.overall.won + 'W / ' + d.overall.lost + 'L | <span style="color:' + (parseFloat(d.overall.winRate) >= 50 ? 'var(--green)' : 'var(--red)') + '">' + d.overall.winRate + '%</span></div>';
    html += '<div style="margin-bottom:12px;"><b>By Confidence:</b></div>';
    for (var bk in d.byConfidence) {
      var b = d.byConfidence[bk];
      html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--bg3);margin:2px 0;border-radius:4px;font-size:12px;"><span>' + bk + '%</span><span>' + b.total + ' tips | ' + b.won + 'W / ' + b.lost + 'L | <span style="color:' + (parseFloat(b.rate) >= 50 ? 'var(--green)' : 'var(--red)') + '">' + b.rate + '%</span></span></div>';
    }
    html += '<div style="margin:12px 0;"><b>By Sport:</b></div>';
    for (var si = 0; si < d.bySport.length; si++) {
      var s = d.bySport[si];
      var weak = parseFloat(s.rate) < 50 ? ' ⚠️' : '';
      html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--bg3);margin:2px 0;border-radius:4px;font-size:12px;"><span>' + s.sport + weak + '</span><span>' + s.total + ' tips | <span style="color:' + (parseFloat(s.rate) >= 50 ? 'var(--green)' : 'var(--red)') + '">' + s.rate + '%</span></span></div>';
    }
    html += '<div style="margin:12px 0;"><b>Calibration:</b></div>';
    for (var ci = 0; ci < d.calibration.length; ci++) {
      var c = d.calibration[ci];
      html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--bg3);margin:2px 0;border-radius:4px;font-size:12px;"><span>' + c.bucket + '%</span><span>Predicted ~' + c.bucket + '% | Actual ' + c.actualRate + '% | ' + c.won + 'W/' + c.lost + 'L</span></div>';
    }
    html += '<div style="margin:12px 0;"><b>ML Models:</b></div>';
    for (var mk in d.mlModels) {
      var m = d.mlModels[mk];
      html += '<div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--bg3);margin:2px 0;border-radius:4px;font-size:12px;"><span>' + mk + '</span><span>' + (m.trained ? '✅ Trained (' + m.samples + ' samples)' : '❌ Not yet') + '</span></div>';
    }
    html += '<div style="margin:12px 0;"><b>Feature Logs:</b> ' + d.featureLogs + ' records</div>';
    if (d.weakSpots && d.weakSpots.length > 0) {
      html += '<div style="margin:12px 0;padding:8px;background:rgba(255,50,50,.1);border-radius:6px;border:1px solid var(--red);font-size:12px;"><b>⚠️ Weak Spots:</b> ' + d.recommendations + '</div>';
    }
    el.innerHTML = html;
  }).catch(function() { if (el) el.innerHTML = '<p style="color:var(--red)">Failed to load backtest.</p>'; });
}

// === BROADCAST ===
function sendBroadcast() {
  var el = document.getElementById('broadcastStatus');
  if (el) el.textContent = 'Sending...';
  apiPost('/api/admin/broadcast').then(function(d) {
    if (el) el.textContent = d.error ? 'Error: ' + d.error : 'Sent! ' + d.message;
    showToast(d.error ? 'Broadcast failed' : 'Broadcast sent!', d.error ? 'error' : 'success');
  }).catch(function() { if (el) el.textContent = 'Network error'; showToast('Network error', 'error'); });
}
function getWhatsAppLink() {
  apiGet('/api/admin/whatsapp-link').then(function(d) {
    if (d.url) { window.open(d.url, '_blank'); showToast('Opening WhatsApp...', 'info'); }
  }).catch(function() {});
}
function sendPushBroadcast() {
  var title = prompt('Push notification title:', 'MJK Betting Tips — New Tips!');
  if (!title) return;
  var body = prompt('Push notification message:', 'Check out today\'s AI-powered tips.');
  if (!body) return;
  showToast('Sending push notification...', 'info');
  apiPost('/api/admin/push-broadcast', { title: title, body: body }).then(function(d) {
    showToast(d.error ? 'Failed: ' + d.error : d.message, d.error ? 'error' : 'success');
  }).catch(function() { showToast('Network error', 'error'); });
}

// === API KEYS ===
function loadApiKey() {
  apiGet('/api/premium/api-key').then(function(d) {
    var el = document.getElementById('apiKeyDisplay');
    if (d.apiKey) { el.textContent = d.apiKey; el.style.display = 'block'; }
    else { el.style.display = 'none'; }
  }).catch(function() {});
}
function generateApiKey() {
  apiPost('/api/premium/api-key').then(function(d) {
    if (d.error) { showToast(d.error, 'error'); return; }
    var el = document.getElementById('apiKeyDisplay');
    el.textContent = d.apiKey; el.style.display = 'block';
    showToast('API key generated!', 'success');
  }).catch(function() {});
}

// === LIVE ODDS COMPARISON ===
function showOddsComparison(tipId, sport, match) {
  var modal = document.getElementById('authModal');
  if (!modal) return;
  modal.style.display = 'flex';
  setTimeout(function() { modal.classList.add('open'); }, 10);
  document.getElementById('authTitle').textContent = 'Odds Comparison';
  document.getElementById('authFormDefault').style.display = 'none';
  document.getElementById('authFormForgot').style.display = 'none';
  var comparisonHtml = '<div id="oddsCompareContent" style="text-align:left;"><div style="text-align:center;padding:20px;color:var(--muted);">Loading odds comparison...</div></div>';
  var existingContent = document.getElementById('oddsCompareContent');
  if (!existingContent) {
    var form = document.getElementById('authFormDefault');
    form.insertAdjacentHTML('beforebegin', comparisonHtml);
  }
  apiGet('/api/odds/compare/' + sport).then(function(d) {
    var el = document.getElementById('oddsCompareContent');
    if (!el) return;
    if (!d.odds || d.odds.length === 0) {
      el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);">No odds comparison available for this sport yet. Odds comparison requires an API key configured on the server.</div>';
      return;
    }
    var html = '<div style="font-size:12px;">';
    html += '<div style="color:var(--muted);margin-bottom:12px;font-size:11px;">Comparing odds across bookmakers for similar matches:</div>';
    var count = 0;
    for (var i = 0; i < d.odds.length && count < 10; i++) {
      var game = d.odds[i];
      if (!game.bookmakers || game.bookmakers.length === 0) continue;
      html += '<div style="background:var(--bg3);border-radius:8px;padding:10px;margin-bottom:8px;">';
      html += '<div style="font-weight:700;color:var(--text);margin-bottom:6px;">' + (game.home_team || '') + ' vs ' + (game.away_team || '') + '</div>';
      for (var bi = 0; bi < game.bookmakers.length && bi < 3; bi++) {
        var bk = game.bookmakers[bi];
        var h2h = bk.markets && bk.markets.find(function(m) { return m.key === 'h2h'; });
        if (h2h && h2h.outcomes) {
          var home = h2h.outcomes.find(function(o) { return o.name === game.home_team; });
          var away = h2h.outcomes.find(function(o) { return o.name === game.away_team; });
          html += '<div style="display:flex;justify-content:space-between;padding:3px 0;border-top:1px solid var(--border);font-size:11px;">';
          html += '<span style="color:var(--muted);">' + bk.title + '</span>';
          html += '<span><span style="color:var(--cyan);">' + (home ? home.price : '-') + '</span>';
          html += ' / <span style="color:var(--purple);">' + (away ? away.price : '-') + '</span></span>';
          html += '</div>';
        }
      }
      html += '</div>';
      count++;
    }
    html += '</div>';
    el.innerHTML = html;
  }).catch(function() {
    var el = document.getElementById('oddsCompareContent');
    if (el) el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--red);">Failed to load odds comparison.</div>';
  });
}

// === TIPS ===
function renderTip(t, accaIdx) {
  var c = cc(t.conf);
  var timeStr = t.kickoff ? formatTime(t.kickoff) : '';
  var icon = t.icon || '⚽';
  var country = t.country || '';
  var sportClass = 'sport-wc';
  if (t.type && t.type.indexOf('tennis_') === 0) sportClass = 'sport-wimbledon';
  else if (t.type && t.type.indexOf('americanfootball_') === 0) sportClass = 'sport-nfl';
  else if (t.type && t.type.indexOf('rugbyleague_') === 0) sportClass = 'sport-nrl';
  else if (t.type && t.type.indexOf('baseball_') === 0) sportClass = 'sport-mlb';
  else if (t.type && t.type.indexOf('aussierules_') === 0) sportClass = 'sport-aussierules';
  else if (t.type && t.type.indexOf('cricket_') === 0) sportClass = 'sport-cricket';
  else if (t.type === 'horse_racing') sportClass = 'sport-horse';
  else if (t.type && t.type.indexOf('mma_') === 0) sportClass = 'sport-mma';
  else if (t.type && t.type.indexOf('darts_') === 0) sportClass = 'sport-darts';
  var oddsHtml = '<div style="text-align:right;flex-shrink:0;"><div class="tip-odds">'+t.odds+'</div><div class="tip-odds-label">AI ODDS</div></div>';
  if (t.realOdds && t.realOdds.home) {
    var isHomePick = t.pick && t.match && t.pick.indexOf(t.match.split(' vs ')[0]) !== -1;
    var realPrice = t.pick.indexOf('Win') !== -1 ? (isHomePick ? t.realOdds.home : t.realOdds.away) : (t.realOdds.home || t.realOdds.away);
    if (t.realOdds.draw && t.pick === 'Draw') realPrice = t.realOdds.draw;
    oddsHtml = '<div style="text-align:right;flex-shrink:0;"><div class="tip-odds">'+t.odds+'</div><div class="tip-odds-label">AI ODDS</div></div><div style="text-align:right;margin-top:4px;flex-shrink:0;"><div class="tip-odds" style="font-size:22px;background:linear-gradient(135deg,var(--gold),var(--gold-dark));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">'+(realPrice ? realPrice.toFixed(2) : '')+'</div><div class="tip-odds-label">'+(t.bookmaker||'')+'</div></div>';
  }
  var valueBadge = t.valueBet ? '<span class="value-badge">VALUE BET</span>' : '';
  var btn = accaIdx !== undefined ? '<button class="add-acca-btn" id="ab'+accaIdx+'" onclick="toggleAcca('+accaIdx+')">+ Add to Acca</button>' : '';
  var oddsBtn = '<button class="add-acca-btn" style="background:rgba(0,200,255,.08);border-color:rgba(0,200,255,.3);color:var(--cyan);" onclick="showOddsComparison(\''+encodeURIComponent(t.match)+'\',\''+(t.type||'soccer_epl')+'\',\''+encodeURIComponent(t.match)+'\')">📊 Compare Odds</button>';
  var shareBtn = '<div class="tip-share-row"><button class="share-btn share-wa" onclick="shareTip(\'' + encodeURIComponent(t.match) + '\',\'' + encodeURIComponent(t.pick + ' @ ' + t.odds + ' (' + t.conf + '%)') + '\',\'whatsapp\')">WhatsApp</button><button class="share-btn share-tw" onclick="shareTip(\'' + encodeURIComponent(t.match) + '\',\'' + encodeURIComponent(t.pick + ' @ ' + t.odds + ' (' + t.conf + '%)') + '\',\'twitter\')">Twitter</button><button class="share-btn share-copy" onclick="shareTip(\'' + encodeURIComponent(t.match) + '\',\'' + encodeURIComponent(t.pick + ' @ ' + t.odds + ' (' + t.conf + '%)') + '\',\'copy\')">Copy</button></div>';
  var leagueHtml = t.league ? '<span class="league-chip">'+esc(t.league)+'</span>' : '';
  var countryHtml = country ? '<span class="country-chip">'+esc(country)+'</span>' : '';
  var mktBadge = '';
  if (t.marketType === 'ou') mktBadge = '<span class="mkt-badge ou">O/U</span>';
  else if (t.marketType === 'btts') mktBadge = '<span class="mkt-badge btts">BTTS</span>';
  else if (t.marketType === 'h2h') mktBadge = '<span class="mkt-badge h2h">' + ((t.type && (t.type.indexOf('mma_') === 0 || t.type.indexOf('darts_') === 0)) ? 'WINNER' : '1X2') + '</span>';
  return '<div class="tip-card'+(t.valueBet?' value-card':'')+'" data-type="'+(t.type||'')+'" data-conf="'+t.conf+'" data-match="'+esc((t.match||'').toLowerCase())+'" data-league="'+esc((t.league||'').toLowerCase())+'"><div class="tip-sport-bar '+sportClass+'"><span>'+icon+' '+(t.sport||'Sport')+'</span>'+countryHtml+leagueHtml+mktBadge+'</div><div class="tip-body"><div class="tip-match">'+esc(t.match)+'</div><div class="tip-time">🕐 '+timeStr+'</div><div class="tip-pick"><div style="min-width:0;"><div class="tip-pick-label">'+esc(t.market)+'</div><div class="tip-pick-val">'+esc(t.pick)+' '+valueBadge+'</div></div>'+oddsHtml+'</div><div class="conf-bar"><div class="conf-fill" style="width:'+t.conf+'%;background:linear-gradient(90deg,'+c+'88,'+c+')"></div></div><div class="tip-footer"><span style="color:'+c+';font-weight:700">★ '+t.conf+'% Confidence</span><span class="tip-status">⏳ Pending</span></div><div class="banker-reason" style="margin-top:10px;font-size:11px;">'+esc(t.reason)+'</div>'+btn+oddsBtn+shareBtn+'</div></div>';
}
function shareTip(matchEnc, pickEnc, platform) {
  var match = decodeURIComponent(matchEnc);
  var pick = decodeURIComponent(pickEnc);
  var text = '🏇⚽ MJK Betting Tips\n\n' + match + '\n' + pick + '\n\n' + window.location.origin;
  if (platform === 'whatsapp') {
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  } else if (platform === 'twitter') {
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text.slice(0, 240)), '_blank');
  } else if (platform === 'copy') {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function() { showToast('Copied to clipboard!', 'success'); });
    } else {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      showToast('Copied to clipboard!', 'success');
    }
  }
}

function renderBanker(b, n) {
  var c = cc(b.conf);
  var timeStr = b.kickoff ? formatTime(b.kickoff) : '';
  var valueBadge = b.valueBet ? '<span class="value-badge" style="margin-left:6px;">VALUE</span>' : '';
  var icon = b.icon || '⚽';
  var country = b.country || '';
  var realOddsHtml = '';
  if (b.realOdds && b.realOdds.home && b.bookmaker) {
    var isHomePick = b.pick && b.match && b.pick.indexOf(b.match.split(' vs ')[0]) !== -1;
    var rp = b.pick.indexOf('Win') !== -1 ? (isHomePick ? b.realOdds.home : b.realOdds.away) : b.realOdds.home;
    if (b.realOdds.draw && b.pick === 'Draw') rp = b.realOdds.draw;
    realOddsHtml = '<div style="font-size:10px;color:var(--gold);margin-top:4px;">📈 '+b.bookmaker+' '+(rp?rp.toFixed(2):'')+'</div>';
  }
  var leagueHtml = b.league ? '<span class="league-chip-sm">'+esc(b.league)+'</span>' : '';
  var countryHtml = country ? '<span class="country-chip-sm">'+esc(country)+'</span>' : '';
  return '<div class="banker-card'+(b.valueBet?' value-card':'')+'"><span class="banker-tag">⭐ Banker '+(n+1)+'</span><div class="banker-match">'+icon+' '+esc(b.match)+'</div><div class="banker-meta">'+leagueHtml+countryHtml+' · '+timeStr+'</div><div class="banker-reason">'+esc(b.reason)+'</div><div class="banker-foot"><div><div class="banker-pick-label">'+esc(b.market)+'</div><div class="banker-pick-val">'+esc(b.pick)+valueBadge+'</div></div><div class="banker-odds-big">'+esc(b.odds)+'</div></div>'+realOddsHtml+'<div class="banker-bar"><div class="banker-fill" style="width:'+b.conf+'%;background:linear-gradient(90deg,'+c+','+c+')"></div></div><div class="banker-conf">★ '+b.conf+'% Confidence</div></div>';
}

function fetchTips() {
  apiGet('/api/tips').then(function(data) {
    if (data.tips && data.tips.length > 0) ALL_TIPS = data.tips;
    if (data.bankers && data.bankers.length > 0) BANKERS = data.bankers;
    if (data.sports && data.sports.length > 0) { SPORTS = data.sports; renderSportTabs(); }
    if (data.userTier && data.userTier !== 'free' && currentUser) currentUser.tier = data.userTier;
    populateBankers();
    populateTips();
    fetchLiveScores();
    updateSocialProof();
  }).catch(function() { populateBankers(); populateTips(); });
}

// === SOCIAL PROOF ===
function updateSocialProof() {
  apiGet('/api/stats').then(function(d) {
    if (d.total) {
      var el = document.getElementById('proofTotalTips');
      if (el) el.textContent = (d.total.won + d.total.lost + d.total.pending) + '+';
      var wr = document.getElementById('proofWinRate');
      if (wr) wr.textContent = d.total.winRate + '%';
    }
  }).catch(function() {});
}

// === LIVE SCORES ===
var LIVE_SCORES = {};
function fetchLiveScores() {
  apiGet('/api/scores/live').then(function(data) {
    LIVE_SCORES = data || {};
    updateLiveScores();
  }).catch(function() {});
}
function updateLiveScores() {
  var cards = document.querySelectorAll('.tip-card');
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    var match = card.querySelector('.tip-match');
    var statusEl = card.querySelector('.tip-status');
    if (!match || !statusEl) continue;
    var matchText = match.textContent;
    for (var key in LIVE_SCORES) {
      var score = LIVE_SCORES[key];
      if (matchText.indexOf(score.homeScore) !== -1 && matchText.indexOf(score.awayScore) !== -1) {
        var tipIdx = parseInt(card.getAttribute('data-idx'), 10);
        var upcoming = ALL_TIPS.filter(function(t){ return !isPast(t.kickoff) && t.conf>=68; });
        if (upcoming[tipIdx]) {
          var tip = upcoming[tipIdx];
          var tipKey = tip.id || (tip.match + tip.pick);
          if (LIVE_SCORES[tipKey]) {
            var s = LIVE_SCORES[tipKey];
            var scoreText = s.homeScore + ' - ' + s.awayScore;
            if (s.status === 'FT') {
              statusEl.innerHTML = '✅ ' + scoreText + ' <span style="color:var(--green);font-weight:700">FT</span>';
              statusEl.style.color = 'var(--green)';
            } else if (s.status === 'LIVE' || s.status === 'HT' || s.status === 'PAUSED') {
              var timeInfo = s.elapsed ? ' (' + s.elapsed + ')' : '';
              statusEl.innerHTML = '🔴 ' + scoreText + ' <span style="color:var(--red);font-weight:700">' + s.status + timeInfo + '</span>';
              statusEl.style.color = 'var(--red)';
            }
          }
        }
      }
    }
  }
}
setInterval(function() { if (ALL_TIPS.length > 0) fetchLiveScores(); }, 60000);

function populateBankers() {
  var el = document.getElementById('tickerStrip');
  if (el) {
    var html = '';
    for (var i = 0; i < BANKERS.length; i++) {
      html += '<span class="ticker-item">⚽ ' + esc(BANKERS[i].match) + '<span class="sep">|</span>' + esc(BANKERS[i].pick) + ' @ ' + esc(BANKERS[i].odds) + '</span>';
    }
    el.innerHTML = html || '<span class="ticker-item">Tips loading...</span>';
  }
  var wrap = document.getElementById('bankerWrap');
  if (!wrap) return;
  var active = BANKERS.filter(function(b){ return !isPast(b.kickoff); }).slice(0,3);
  if (active.length===0) { wrap.innerHTML = '<div style="color:var(--muted);text-align:center;padding:30px;">New bankers update at midnight.</div>'; return; }
  var html = '';
  for (var i=0;i<active.length;i++) html += renderBanker(active[i], i);
  wrap.innerHTML = html;
}
function populateTips() {
  renderTab(currentTab);
}

// === SEARCH & FILTER ===
function filterTips() {
  renderTab(currentTab);
}
function filterByConf(level, btn) {
  currentConfFilter = level;
  document.querySelectorAll('.filter-chip').forEach(function(c) { c.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderTab(currentTab);
}

function renderSportTabs() {
  var el = document.getElementById('sportTabs');
  if (!el) return;
  var html = '<button class="tab-btn active" onclick="switchTab(\'all\',this)">📋 All</button>';
  for (var i=0;i<SPORTS.length;i++) { var s = SPORTS[i]; html += '<button class="tab-btn" onclick="switchTab(\''+s.key+'\',this)">'+(s.icon||'')+' '+(s.name||'')+'</button>'; }
  el.innerHTML = html;
}
function switchTab(type, btn) {
  currentTab = type;
  var btns = document.querySelectorAll('.tab-btn');
  for (var i=0;i<btns.length;i++) btns[i].classList.remove('active');
  if (btn) btn.classList.add('active');
  renderTab(type);
}
function renderTab(type) {
  var el = document.getElementById('tipsGrid');
  if (!el) return;
  var list = ALL_TIPS.filter(function(t) {
    if (isPast(t.kickoff) || t.conf < 68) return false;
    if (type !== 'all' && t.type !== type) return false;
    // Search filter
    var searchVal = (document.getElementById('tipSearch') ? document.getElementById('tipSearch').value : '').toLowerCase();
    if (searchVal) {
      var haystack = ((t.match || '') + ' ' + (t.league || '') + ' ' + (t.country || '') + ' ' + (t.pick || '') + ' ' + (t.sport || '')).toLowerCase();
      if (haystack.indexOf(searchVal) === -1) return false;
    }
    // Confidence filter
    if (currentConfFilter === 'high' && t.conf < 85) return false;
    if (currentConfFilter === 'mid' && (t.conf < 75 || t.conf >= 85)) return false;
    if (currentConfFilter === 'low' && (t.conf < 68 || t.conf >= 75)) return false;
    return true;
  });
  if (list.length===0) { el.innerHTML = '<div class="empty-state">No upcoming tips match your filters.</div>'; return; }
  var html = '';
  for (var i=0;i<list.length;i++) html += renderTip(list[i], i);
  el.innerHTML = html;
}

// === ACCA ===
function toggleAcca(idx) {
  var btn = document.getElementById('ab'+idx);
  if (!btn) return;
  if (accaSelections[idx]) {
    delete accaSelections[idx];
    btn.classList.remove('added');
    btn.textContent = '+ Add to Acca';
  } else {
    var upcoming = ALL_TIPS.filter(function(t){ return !isPast(t.kickoff) && t.conf>=68; });
    accaSelections[idx] = upcoming[idx];
    btn.classList.add('added');
    btn.textContent = '✓ Added';
  }
  renderAcca();
}
function renderAcca() {
  var legsEl = document.getElementById('accaLegs');
  var sumEl = document.getElementById('accaSummary');
  if (!legsEl) return;
  var keys = Object.keys(accaSelections);
  if (keys.length===0) { legsEl.innerHTML = '<div class="acca-empty">Tap "+ Add to Acca" on any tip to build your multi.</div>'; if (sumEl) sumEl.style.display = 'none'; return; }
  var combined=1, html='';
  for (var i=0;i<keys.length;i++) {
    var t = accaSelections[keys[i]];
    if (!t) continue;
    combined *= parseFloat(t.odds)||1;
    html += '<div class="acca-leg"><div style="min-width:0;"><div class="acca-leg-match">'+(t.icon||'')+' '+t.match+'</div><div class="acca-leg-pick">'+t.market+': '+t.pick+'</div></div><div style="display:flex;align-items:center;flex-shrink:0;"><div class="acca-leg-odds">'+t.odds+'</div><button class="acca-remove" onclick="toggleAcca('+keys[i]+')" aria-label="Remove">×</button></div></div>';
  }
  legsEl.innerHTML = html;
  if (sumEl) { sumEl.style.display = 'flex'; var o = document.getElementById('accaOdds'); if (o) o.textContent = combined.toFixed(2); }
}
function placeAcca() {
  var keys = Object.keys(accaSelections);
  if (keys.length < 2) { showToast('Add at least 2 picks to your acca.', 'info'); return; }
  var picks = keys.map(function(k) { return accaSelections[k]; });
  var msg = 'Hi MJK Betting Tips, I want to place this accumulator:\n';
  for (var i=0;i<picks.length;i++) msg += (i+1) + '. ' + picks[i].match + ' — ' + picks[i].pick + ' @ ' + picks[i].odds + '\n';
  msg += '\nCombined Odds: ' + document.getElementById('accaOdds').textContent;
  window.open('https://wa.me/27677834591?text=' + encodeURIComponent(msg), '_blank');
}

// === TIERS RENDER ===
function renderTiers() {
  var grid = document.getElementById('tiersGrid');
  if (!grid || !TIERS.free) return;
  var plans = [
    { key:'free', name:'Free', price:'R0', period:'forever', what:'Basic app access', features:['3 tips daily','70%+ confidence filter','Basic match results'], btn:'Current Plan', featured:false },
    { key:'starter', name:'Starter', price:'R150', period:'per week', what:'10 tips + Telegram alerts', features:['10 tips daily','Daily banker picks','Telegram alerts','All sports (exc. horse racing)'], btn:'Subscribe', featured:false },
    { key:'pro', name:'Pro', price:'R400', period:'per week', what:'25 tips + VIP tools + Horse Racing', features:['25 tips daily','Horse racing tips','Acca builder','ROI dashboard','Accumulator tips','Correct score tips'], btn:'Subscribe', featured:true },
    { key:'elite', name:'Elite', price:'R800', period:'per month', what:'30 tips + Horse Racing + everything', features:['30 tips daily','Horse racing tips','Sport filtering','Monthly reports','1-on-1 consultations','Early access 6am SAST'], btn:'Subscribe', featured:false }
  ];
  var html = '';
  for (var i = 0; i < plans.length; i++) {
    var p = plans[i];
    var isCurrent = currentUser && currentUser.tier === p.key;
    html += '<div class="plan-card' + (p.featured?' featured':'') + '"><div class="plan-name">' + p.name + '</div><div class="plan-what">' + p.what + '</div><div class="plan-price"><span>' + p.price.replace(/[0-9]/g,'') + '</span>' + p.price.replace(/[^0-9]/g,'') + '</div><div class="plan-period">' + p.period + '</div><ul class="plan-features">';
    for (var f = 0; f < p.features.length; f++) html += '<li>' + p.features[f] + '</li>';
    html += '</ul>';
    if (isCurrent) html += '<button class="btn btn-outline" disabled style="opacity:0.5">Current</button>';
    else if (p.key === 'free') html += '<button class="btn btn-outline" onclick="showAuthModal(\'register\')">Get Started</button>';
    else html += '<button class="btn ' + (p.featured?'btn-blue':'btn-outline') + '" onclick="openSubModal(\'' + p.name + '\',\'' + p.price + '\',\'' + p.key + '\')">' + p.btn + '</button>';
    html += '</div>';
  }
  grid.innerHTML = html;
}

function renderPremiumPlans() {
  var grid = document.getElementById('premiumPlans');
  if (!grid || !TIERS.free || !currentUser) return;
  if (currentUser.tier === 'elite') { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">You are on the Elite plan — all features unlocked.</div>'; return; }
  var plans = [
    { key:'starter', name:'Starter', price:'R150', period:'per week', features:['10 tips daily','Telegram alerts','Daily banker picks'] },
    { key:'pro', name:'Pro', price:'R400', period:'per week', features:['25 tips daily','Horse racing tips','Acca builder','ROI dashboard','Correct score tips','Accumulators'] },
    { key:'elite', name:'Elite', price:'R800', period:'per month', features:['30 tips daily','Horse racing tips','Sport filtering','Monthly reports','1-on-1 coaching','Early access'] }
  ];
  var html = '';
  for (var i = 0; i < plans.length; i++) {
    var p = plans[i];
    var isCurrent = currentUser.tier === p.key;
    html += '<div class="plan-card"><div class="plan-name">' + p.name + '</div><div class="plan-price"><span>' + p.price.replace(/[0-9]/g,'') + '</span>' + p.price.replace(/[^0-9]/g,'') + '</div><div class="plan-period">' + p.period + '</div><ul class="plan-features">';
    for (var f = 0; f < p.features.length; f++) html += '<li>' + p.features[f] + '</li>';
    html += '</ul>';
    if (isCurrent) html += '<button class="btn btn-outline" disabled style="opacity:0.5">Current</button>';
    else html += '<button class="btn btn-blue" onclick="openSubModal(\'' + p.name + '\',\'' + p.price + '\',\'' + p.key + '\')">Upgrade</button>';
    html += '</div>';
  }
  grid.innerHTML = html;
}

function openSubModal(plan, price, tierKey) {
  var m = document.getElementById('subModal');
  if (!m) return;
  if (!currentUser) { showAuthModal('login'); return; }
  m.classList.add('open');
  document.getElementById('subTitle').textContent = plan + ' Plan';
  document.getElementById('subDesc').textContent = 'Pay R' + price.replace(/[^0-9]/g,'') + (tierKey === 'elite' ? '/month' : '/week') + ' via EFT to the banking details below.';
  document.getElementById('subAmount').textContent = price + ' ' + (tierKey === 'elite' ? '/month' : '/week');
  var ref = document.getElementById('bankRef');
  if (ref) ref.textContent = 'MJK ' + currentUser.username;
  var waLink = document.getElementById('subWaLink');
  if (waLink) {
    var amt = price.replace(/[^0-9]/g,'');
    var msg = 'Hi MJK, I want to upgrade to the ' + plan + ' plan (R' + amt + (tierKey === 'elite' ? '/month' : '/week') + ').\n\nMy username: ' + currentUser.username + '\n\nI have made the EFT payment. Here is my proof of payment:';
    waLink.href = 'https://wa.me/2767834591?text=' + encodeURIComponent(msg);
  }
}
function copyBanking() {
  var ref = document.getElementById('bankRef');
  var refText = ref ? ref.textContent : 'MJK username';
  var text = 'Bank: Tymebank\nAccount: 51135445245\nHolder: Mojalefa Vincent Matlholwa\nBranch: 678910\nReference: ' + refText;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function() { showToast('Banking details copied!', 'success'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    showToast('Banking details copied!', 'success');
  }
}
function closeSub() {
  var m = document.getElementById('subModal');
  if (m) m.classList.remove('open');
}

// === STATS & HISTORY ===
function fetchStats() {
  apiGet('/api/stats').then(function(data) {
    var el = document.getElementById('statsStrip');
    if (!el) return;
    var html = '';
    if (data.total) { var tr = data.total; html += '<div class="stat-item type-all"><span>📊</span><span>All: <span class="sw">' + tr.won + 'W</span> <span class="sl">' + tr.lost + 'L</span> <span class="sp">(' + tr.pending + ' pending)</span> <span class="sr">' + tr.winRate + '%</span></span></div>'; }
    if (data.sports) {
      for (var i = 0; i < data.sports.length; i++) {
        var s = data.sports[i]; if (s.total === 0) continue;
        html += '<div class="stat-item"><span>' + getSportIcon(s.type) + '</span><span>' + s.sport.split(' ')[0] + ': <span class="sw">' + s.won + 'W</span> <span class="sl">' + s.lost + 'L</span> <span class="sr">' + s.winRate + '%</span></span></div>';
      }
    }
    el.innerHTML = '<div class="stats-inner">' + (html || '<div class="stats-loading">No stats available</div>') + '</div>';
  }).catch(function() {});
}
function getSportIcon(type) {
  var icons = { 'soccer_fifa_world_cup':'⚽','soccer_epl':'⚽','tennis_atp_wimbledon':'🎾','tennis_wta_wimbledon':'🎾','americanfootball_nfl':'🏈','rugbyleague_nrl':'🏉','baseball_mlb':'⚾','aussierules_afl':'🏉','cricket_international_t20':'🏏','horse_racing':'🏇','mma_mixed_martial_arts':'🥊','darts_pdc':'🎯' };
  return icons[type] || '⚽';
}
function fetchHistory() {
  apiGet('/api/history').then(function(data) {
    var el = document.getElementById('historyWrap');
    if (!el) return;
    if (!data.tips || data.tips.length === 0) { el.innerHTML = '<div class="empty-state">No completed tips yet.</div>'; return; }
    el.innerHTML = data.tips.map(function(t) {
      var badge = t.result === 'won' ? '<span class="result-badge result-won">WON</span>' : '<span class="result-badge result-lost">LOST</span>';
      var hc = ''; if (t.country) hc += ' · ' + t.country; if (t.league) hc += ' · ' + t.league;
      return '<div class="hist-card"><div class="hist-top"><span class="hist-match">' + t.match + '</span><span class="hist-odds">' + t.odds + '</span></div><div class="hist-pick">' + t.pick + ' ' + badge + '</div><div class="hist-meta">' + t.sport + hc + ' · Conf: ' + t.conf + '%' + (t.kickoff ? ' · ' + formatTime(t.kickoff) : '') + '</div></div>';
    }).join('');
    renderHistoryChart();
  }).catch(function() {});
}

function fetchBankerResults() {
  apiGet('/api/banker-results').then(function(data) {
    var s = data.stats || {};
    var wr = document.getElementById('bankerWinRate');
    var tot = document.getElementById('bankerTotal');
    var w = document.getElementById('bankerWon');
    var l = document.getElementById('bankerLost');
    if (wr) wr.textContent = s.winRate + '%';
    if (tot) tot.textContent = s.total;
    if (w) w.textContent = s.won;
    if (l) l.textContent = s.lost;
    var el = document.getElementById('bankerResultsWrap');
    if (!el) return;
    if (!data.tips || data.tips.length === 0) {
      el.innerHTML = '<div class="empty-state">No banker results yet. Bankers are tips with 80%+ confidence.</div>';
      return;
    }
    el.innerHTML = data.tips.map(function(t) {
      var badge = t.result === 'won' ? '<span class="result-badge result-won">WON</span>' : '<span class="result-badge result-lost">LOST</span>';
      var hc = ''; if (t.country) hc += ' · ' + t.country; if (t.league) hc += ' · ' + t.league;
      return '<div class="hist-card"><div class="hist-top"><span class="hist-match">' + (t.icon || '') + ' ' + t.match + '</span><span class="hist-odds">' + t.odds + '</span></div><div class="hist-pick">' + t.pick + ' ' + badge + '</div><div class="hist-meta">' + t.sport + hc + ' · Conf: ' + t.conf + '%' + (t.kickoff ? ' · ' + formatTime(t.kickoff) : '') + '</div></div>';
    }).join('');
    renderBankerChart(data.stats);
  }).catch(function() {});
}

function renderBankerChart(stats) {
  if (typeof Chart === 'undefined' || !stats || stats.total === 0) return;
  if (chartInstances.banker) chartInstances.banker.destroy();
  var ctx = document.getElementById('bankerChart');
  if (!ctx) return;
  chartInstances.banker = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Won', 'Lost'],
      datasets: [{ data: [stats.won, stats.lost], backgroundColor: [chartColors.green, chartColors.red], borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: true, cutout: '65%',
      plugins: { legend: { position: 'bottom', labels: { color: getChartTextColor(), padding: 16 } } }
    }
  });
}

function setTodayLabel() {
  var el = document.getElementById('todayLabel');
  if (!el) return;
  var d = nowSAST();
  var DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  el.textContent = DAYS[d.getUTCDay()]+' '+d.getUTCDate()+' '+MONTHS[d.getUTCMonth()]+' '+d.getUTCFullYear();
}

// === BOOT ===
function boot() {
  loadTheme();
  setTodayLabel();
  fetchTiers();
  if (authToken) loadAuth();
  fetchTips();
  fetchStats();
  fetchHistory();
  fetchBankerResults();
  updateAuthUI();
  if (currentUser) startSessionTimer();
  trackVisit();
}

var TIPS_INTERVAL = setInterval(function() {
  if (ALL_TIPS.length === 0) { fetchTips(); } else { clearInterval(TIPS_INTERVAL); }
}, 5000);

lastDate = todayKey();
boot();
setInterval(function() {
  var current = todayKey();
  if (current !== lastDate) { lastDate = current; setTodayLabel(); }
  fetchTips();
  // Auto-refresh results every 5 minutes
  fetchHistory();
  fetchBankerResults();
  // Trigger server-side result checking every 10 minutes
  if (Math.random() < 0.17) {
    apiPost('/api/check-results').then(function(d) {
      if (d && d.ok) {
        console.log('[RESULTS] Server checked: W=' + d.won + ' L=' + d.lost + ' Pending=' + d.pending);
        fetchHistory();
        fetchBankerResults();
        fetchStats();
      }
    }).catch(function() {});
  }
}, 60000);

// Close dropdowns on outside click
document.addEventListener('click', function(e) {
  var dd = document.getElementById('userDropdown');
  var um = document.getElementById('userMenu');
  if (dd && dd.classList.contains('open') && !e.target.closest('.user-menu')) {
    dd.classList.remove('open');
    if (um) um.classList.remove('open');
  }
});

// Keyboard navigation
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeAuth();
    closeSub();
    closeDropdown();
    var rm = document.getElementById('realityModal');
    if (rm) { rm.classList.remove('open'); rm.style.display = 'none'; }
    var cw = document.getElementById('chatWindow');
    if (cw && cw.classList.contains('open')) toggleChat();
  }
});

// === CHATBOT ===
var chatOpen = false;
var chatHistory = [];
var chatInit = false;
var CHATBOT_NAME = 'MJK Assistant';
var WHATSAPP_LINK = 'https://wa.me/2767834591?text=' + encodeURIComponent('Hi MJK, I need help with the betting tips app.');
var TELEGRAM_LINK = 'https://t.me/MJKBettingTips';
var SITE_URL = window.location.origin;

var chatState = { step: null, topic: null, data: {} };

var chatFlows = {
  greeting: {
    patterns: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'good afternoon', 'howzit', 'sawubona', 'molo', 'yo', 'sup'],
    reply: function() {
      var hour = new Date().getHours();
      var greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
      var name = (currentUser && currentUser.username) ? currentUser.username : 'there';
      return { text: greeting + ', ' + name + '! 😊\n\nWelcome to MJK Betting Tips. I\'m here to help you get the most out of the app.\n\nWhat brings you here today?', quickReplies: ['Tell me about plans', 'How does it work?', 'I need help with my account', 'Just browsing'] };
    }
  },
  plans_intro: {
    patterns: ['plan', 'price', 'pricing', 'cost', 'how much', 'subscribe', 'subscription', 'package', 'tier', 'upgrade', 'tell me about plans', 'what plans'],
    reply: function() {
      return { text: 'Great question! We\'ve got something for everyone.\n\nLet me walk you through it 👇\n\n🆓 **Free** — R0/forever\n• 3 tips per day\n• All sports except horse racing\n• Great to test the waters!\n\n⭐ **Starter** — R150/week\n• 10 tips per day\n• Telegram alerts\n• Daily banker picks\n\n💎 **Pro** — R400/week\n• 25 tips per day\n• Horse racing + acca builder\n• ROI dashboard\n\n👑 **Elite** — R800/month\n• 30 tips per day + early access\n• Monthly reports & coaching\n• Everything included\n\nWhich one sounds right for you?', quickReplies: ['Starter details', 'Pro details', 'Elite details', 'Free plan details', 'How do I pay?'] };
    }
  },
  plan_starter: {
    patterns: ['starter', 'starter plan', 'starter details', 'cheapest', 'basic plan', 'affordable'],
    reply: function() {
      return { text: '⭐ **Starter — R150/week**\n\nThis is our most popular starter plan. Here\'s what you get:\n\n✅ 10 tips per day across all sports\n✅ Telegram alerts so you never miss a pick\n✅ Daily banker picks (high-confidence bets)\n\nPerfect if you\'re getting serious about betting but want to keep it affordable.\n\nWant to know how to get started?', quickReplies: ['How do I pay?', 'Compare plans', 'What sports are covered?'] };
    }
  },
  plan_pro: {
    patterns: ['pro', 'pro plan', 'pro details', 'pro tier'],
    reply: function() {
      return { text: '💎 **Pro — R400/week**\n\nThis is where it gets serious:\n\n✅ 25 tips per day\n✅ Horse racing tips 🐎\n✅ Acca builder — combine tips into accumulators\n✅ ROI dashboard — track your profits\n✅ All sports including correct scores\n\nMost of our serious bettors go with Pro.\n\nWant to sign up?', quickReplies: ['How do I pay?', 'What\'s the difference vs Elite?', 'What sports are covered?'] };
    }
  },
  plan_elite: {
    patterns: ['elite', 'elite plan', 'elite details', 'best plan', 'premium', 'ultimate'],
    reply: function() {
      return { text: '👑 **Elite — R800/month**\n\nOur ultimate plan — everything included:\n\n✅ 30 tips per day\n✅ Early access at 6am SAST (before everyone else)\n✅ Sport filtering — focus on your favourite sports\n✅ Monthly performance reports\n✅ 1-on-1 coaching sessions\n✅ API access for developers\n✅ Everything in Pro\n\nBest value for serious bettors who want the full experience.\n\nReady to upgrade?', quickReplies: ['How do I pay?', 'Compare plans', 'What\'s the difference vs Pro?'] };
    }
  },
  plan_free: {
    patterns: ['free', 'free plan', 'free tier', 'without paying', 'no cost', 'free details'],
    reply: function() {
      return { text: '🆓 **Free Plan — R0 forever**\n\nHere\'s what you get without spending a cent:\n\n✅ 3 tips per day\n✅ 70%+ confidence filter\n✅ All sports (except horse racing)\n✅ Basic match results\n\nIt\'s a great way to test our AI before going premium.\n\nWhen you\'re ready for more, upgrading is easy!', quickReplies: ['How do I upgrade?', 'Tell me about paid plans'] };
    }
  },
  compare: {
    patterns: ['compare', 'difference', 'which plan', 'best plan', 'recommend', 'which one', 'what should i pick'],
    reply: function() {
      return { text: 'Here\'s how the plans stack up:\n\n| Feature | Free | Starter | Pro | Elite |\n| Tips/day | 3 | 10 | 25 | 30 |\n| Price | R0 | R150/wk | R400/wk | R800/mo |\n| Telegram | ❌ | ✅ | ✅ | ✅ |\n| Horse Racing | ❌ | ❌ | ✅ | ✅ |\n| Acca Builder | ❌ | ❌ | ✅ | ✅ |\n| ROI Dashboard | ❌ | ❌ | ✅ | ✅ |\n| Monthly Reports | ❌ | ❌ | ❌ | ✅ |\n| Coaching | ❌ | ❌ | ❌ | ✅ |\n| Early Access | ❌ | ❌ | ❌ | ✅ |\n\nMy suggestion? Start with **Starter** if you\'re new, or go **Pro** if you want full power.', quickReplies: ['How do I pay?', 'Tell me more about Starter', 'Tell me more about Pro'] };
    }
  },
  payment: {
    patterns: ['pay', 'payment', 'bank', 'eft', 'banking', 'deposit', 'transfer', 'how to pay', 'how do i pay', 'how do i upgrade', 'upgrade'],
    reply: function() {
      return { text: 'Paying is simple — here\'s the step-by-step 👇\n\n**Step 1:** Go to the *Premium* tab in the app\n\n**Step 2:** Choose your plan and tap *Subscribe*\n\n**Step 3:** You\'ll see our banking details — copy them\n\n**Step 4:** Make an EFT payment from your bank\n\n**Step 5:** Tap *Send Proof on WhatsApp* to send us your proof of payment\n\n**Step 6:** We\'ll activate your plan within 1 hour!\n\n🏦 **Bank:** Tymebank\n📋 **Account:** 51135445245\n👤 **Holder:** Mojalefa Vincent Matlholwa\n🔢 **Branch:** 678910\n\nNeed help with any step?', quickReplies: ['I sent proof, what next?', 'Contact admin', 'Go back to plans'] };
    }
  },
  payment_status: {
    patterns: ['sent proof', 'what next', 'after payment', 'activated', 'waiting', 'pending', 'how long'],
    reply: function() {
      return { text: 'After you send your proof of payment on WhatsApp:\n\n1️⃣ Our admin verifies the payment\n2️⃣ Your plan gets activated\n3️⃣ You\'ll see your new tier in the app\n\nThis usually takes **less than 1 hour** during business hours.\n\nIf it\'s been longer, feel free to message us on WhatsApp to check!', quickReplies: ['Contact admin', 'How do I check my tier?', 'Go back to plans'] };
    }
  },
  register: {
    patterns: ['register', 'sign up', 'create account', 'join', 'new account', 'how to register', 'how do i register'],
    reply: function() {
      return { text: 'Signing up is quick! Here\'s how 👇\n\n**Step 1:** Tap the *Register* button on the login screen\n\n**Step 2:** Choose a username (3-20 characters, letters and underscores only)\n\n**Step 3:** Create a password — it needs:\n• At least 8 characters\n• One uppercase letter (A-Z)\n• One lowercase letter (a-z)\n• One number (0-9)\n\n**Step 4:** Tap *Register* and you\'re in!\n\nOnce registered, you can browse free tips immediately and upgrade anytime.', quickReplies: ['How do I pay?', 'Tell me about plans', 'I can\'t register'] };
    }
  },
  register_issue: {
    patterns: ['can\'t register', 'register not working', 'register error', 'signup error', 'sign up error'],
    reply: function() {
      return { text: 'Sorry to hear that! Here are the most common issues:\n\n🔐 **Password too short** — needs 8+ characters\n🔑 **Missing uppercase/lowercase/number** — make sure you have all three\n👤 **Username taken** — try a different one\n🌐 **Connection issue** — check your internet\n\nIf it still doesn\'t work, WhatsApp us and we\'ll sort it out for you.', quickReplies: ['Contact admin', 'Try again'] };
    }
  },
  login_issue: {
    patterns: ['can\'t login', 'login not working', 'forgot password', 'lost password', 'wrong password', 'login error', 'login issue', 'can\'t log in', 'password reset'],
    reply: function() {
      return { text: 'Let\'s get you back in! Here\'s what to try:\n\n**Forgot password?**\n1. Tap *Forgot Password?* on the login screen\n2. Enter your username\n3. You\'ll get a reset token\n4. Use it to set a new password\n\n**Still can\'t login?**\n• Check your username is spelled correctly\n• Passwords are case-sensitive — check caps lock\n• Try clearing your browser cache\n\nIf nothing works, WhatsApp us with your username and we\'ll fix it!', quickReplies: ['Contact admin', 'How do I register?'] };
    }
  },
  sports: {
    patterns: ['sport', 'sports', 'football', 'soccer', 'tennis', 'cricket', 'nfl', 'nrl', 'mlb', 'afl', 'horse', 'racing', 'mma', 'ufc', 'darts', 'which sports', 'what sports', 'covered'],
    reply: function() {
      return { text: 'We cover all the major sports! Here\'s the full list 👇\n\n⚽ **Football** — EPL, La Liga, Serie A, Champions League, MLS, and more\n🎾 **Tennis** — ATP, WTA, Grand Slams\n🏈 **NFL** — American football\n🏉 **NRL** — Rugby league\n⚾ **MLB** — Baseball\n🏏 **Cricket** — T20, ODIs, Tests\n🐎 **Horse Racing** — UK, SA, international\n🥊 **MMA/UFC** — UFC events\n🎯 **PDC Darts** — Professional darts\n🏉 **AFL** — Australian rules\n\nOur AI analyzes odds, form, and stats for each sport. Tips are only posted when 3 models agree!', quickReplies: ['How accurate are tips?', 'Plans & pricing', 'Which sport is best for betting?'] };
    }
  },
  accuracy: {
    patterns: ['accurate', 'accuracy', 'win rate', 'performance', 'results', 'how good', 'reliable', 'trust', 'does it work', 'proof'],
    reply: function() {
      return { text: 'Great question — here\'s how our AI works 🧠\n\nWe use **3 independent AI models**:\n\n1️⃣ **MJK AI** — ELO ratings + Poisson stats + form analysis\n2️⃣ **BSD CatBoost** — Machine learning on historical data\n3️⃣ **API-Football** — Poisson + statistical analysis\n\nA tip is only posted when **all 3 models unanimously agree**. This means fewer tips but much higher quality.\n\nYou can check live win rates in the *Results* tab — everything is tracked transparently!', quickReplies: ['What sports work best?', 'Plans & pricing', 'How do I pay?'] };
    }
  },
  how_it_works: {
    patterns: ['how does it work', 'how it works', 'explain', 'what is this', 'what do you do', 'tell me about', 'how does this app work'],
    reply: function() {
      return { text: 'Here\'s how MJK Betting Tips works 👇\n\n**1. Our AI generates tips**\nEvery day, our 3 AI models analyze upcoming matches across 10+ sports.\n\n**2. 3 models must agree**\nA tip only gets posted when all 3 models unanimously agree on the outcome. This filters out uncertain predictions.\n\n**3. You get notified**\nTips appear in the app and (on paid plans) via Telegram alerts.\n\n**4. You place your bet**\nEach tip includes the pick, odds, confidence %, and reasoning.\n\n**5. We track results**\nAll results are tracked automatically so you can see our live performance.\n\nWant to see it in action?', quickReplies: ['Try the free plan', 'Plans & pricing', 'How accurate are tips?'] };
    }
  },
  account: {
    patterns: ['account', 'password', 'login', 'forgot', 'lost password', 'can\'t login', 'change password', 'help with account', 'account help', 'my account'],
    reply: function() {
      return { text: 'I can help with account stuff! What\'s going on?\n\n• I forgot my password\n• I can\'t login\n• I want to change my password\n• I can\'t register\n\nPick one or describe your issue:', quickReplies: ['Forgot password', 'Can\'t login', 'Can\'t register'] };
    }
  },
  cancel: {
    patterns: ['cancel', 'unsubscribe', 'stop subscription', 'refund', 'money back', 'end subscription', 'downgrade'],
    reply: function() {
      return { text: 'No worries — here\'s how cancellation works:\n\n📅 **Auto-expiry**\n• Weekly plans (Starter/Pro) expire automatically after 7 days\n• Monthly plans (Elite) expire after 30 days\n• If you don\'t renew, you\'re back to Free\n\n📱 **Manual change**\nTo change or cancel your plan sooner, WhatsApp us at 067 783 4591\n\nWe handle all changes personally to make sure everything goes smoothly.', quickReplies: ['Contact admin', 'Tell me about plans'] };
    }
  },
  app_usage: {
    patterns: ['app', 'website', 'link', 'url', 'download', 'install', 'open', 'access', 'where is'],
    reply: function() {
      return { text: 'You can access MJK Tips from anywhere 🌍\n\n🌐 **Website:** mjkbettingtips.onrender.com\n\n📱 **Add to Home Screen (like an app):**\n\n*iPhone:*\n1. Open the site in Safari\n2. Tap the Share button\n3. Tap "Add to Home Screen"\n\n*Android:*\n1. Open the site in Chrome\n2. Tap the 3-dot menu\n3. Tap "Add to Home Screen"\n\nIt works just like a native app — no download needed!', quickReplies: ['Plans & pricing', 'Sports covered'] };
    }
  },
  bankers: {
    patterns: ['banker', 'bankers', 'high confidence', 'safe bet', 'sure bet', 'sure win', 'best pick'],
    reply: function() {
      return { text: 'Our **Bankers** are the picks our AI is most confident about — 80%+ confidence 🎯\n\nHere\'s what makes them special:\n\n✅ All 3 AI models must agree strongly\n✅ Higher confidence = higher win rate\n✅ Available for all sports\n\nYou\'ll find them in the *Bankers* tab in the app.\n\n**Pro** and **Elite** plans get extra bankers including horse racing!', quickReplies: ['How accurate are they?', 'Plans & pricing', 'How do I pay?'] };
    }
  },
  acca: {
    patterns: ['acca', 'accumulator', 'multi', 'combo', 'parlay', 'multiple'],
    reply: function() {
      return { text: 'Our **Acca Builder** lets you combine multiple tips into one accumulator bet! 🎰\n\nHow it works:\n\n1. Go to the *Acca Builder* tab\n2. Pick tips from different matches/sports\n3. See your combined odds instantly\n4. Place one bet with bigger potential returns!\n\nAvailable on **Pro** (R400/wk) and **Elite** (R800/mo) plans.', quickReplies: ['How do I upgrade to Pro?', 'How do I pay?'] };
    }
  },
  horse: {
    patterns: ['horse racing', 'horse', 'horse tips', 'racing tips'],
    reply: function() {
      return { text: '🐎 **Horse Racing** tips are available on our premium plans!\n\nOur AI analyzes:\n• Form guides\n• Track conditions\n• Jockey stats\n• Historical performance\n\nAvailable on **Pro** (R400/wk) and **Elite** (R800/mo).\n\nUpgrade to Pro to unlock horse racing!', quickReplies: ['How do I pay?', 'Tell me about Pro', 'Compare plans'] };
    }
  },
  telegram: {
    patterns: ['telegram', 'tg', 'telegram bot', 'telegram channel'],
    reply: function() {
      return { text: 'Our Telegram bot gives you instant access to tips! 📱\n\n🔗 **Join:** t.me/MJKBettingTips\n\nHere\'s what you can do:\n/tips — Today\'s free tips\n/bankers — Highest confidence picks\n/all — All upcoming tips\n/sport <name> — Filter by sport\n/results — Recent results\n/stats — Performance stats\n\nTelegram alerts are included on **Starter**, **Pro**, and **Elite** plans!', quickReplies: ['Plans & pricing', 'How do I pay?'] };
    }
  },
  contact: {
    patterns: ['whatsapp', 'wa', 'contact', 'support', 'help', 'admin', 'talk to', 'speak to', 'human', 'real person', 'agent', 'customer service'],
    reply: function() {
      return { text: 'I\'d love to help, but some things are best handled by our admin team 👇\n\n📱 **WhatsApp:** 067 783 4591\n\nThey can help with:\n• Payment verification\n• Account issues\n• Plan changes\n• Technical problems\n• Any other questions\n\nTap below to chat directly on WhatsApp:', quickReplies: ['Open WhatsApp', 'Go back to plans'] };
    }
  },
  whatsapp_link: {
    patterns: ['open whatsapp', 'whatsapp link', 'send whatsapp', 'chat on whatsapp'],
    reply: function() {
      var msg = encodeURIComponent('Hi! I need help with MJK Betting Tips.');
      window.open('https://wa.me/27677834591?text=' + msg, '_blank');
      return { text: 'Opening WhatsApp now! 💬\n\nOur admin will help you out. You can also reach us at:\n📱 067 783 4591', quickReplies: ['Go back to plans', 'Other questions'] };
    }
  },
  value_bet: {
    patterns: ['value', 'value bet', 'worth', 'worth it'],
    reply: function() {
      return { text: 'Value bets are where our AI spots odds that are **higher than they should be** based on the true probability 💡\n\nLook for the **VALUE** badge on tips in the app!\n\nThis means the bookmaker is offering better odds than the actual chance of winning — long-term, these are profitable.\n\nAvailable across all sports on all plans.', quickReplies: ['How accurate are tips?', 'Plans & pricing', 'How do I pay?'] };
    }
  },
  thanks: {
    patterns: ['good', 'nice', 'great', 'awesome', 'love it', 'thanks', 'thank you', 'perfect', 'cool', 'sweet', 'legit', 'dope'],
    reply: function() {
      return { text: 'Happy to help! 😊\n\nEnjoy the tips and may your bets hit! 🎯💪\n\nAnything else I can help with?', quickReplies: ['Tell me about plans', 'Sports covered', 'Contact admin'] };
    }
  },
  not_sure: {
    patterns: ['not sure', 'idk', 'don\'t know', 'just looking', 'browsing', 'curious', 'checking it out', 'tell me more'],
    reply: function() {
      return { text: 'No pressure at all! 😊\n\nHere\'s a quick overview:\n\n🎯 We use AI to generate betting tips across 10+ sports\n📊 3 models must agree before a tip is posted\n📈 You can track live results in the app\n\nThe best way to see if it works is to try the **Free** plan — 3 tips/day, no payment needed!\n\nWant to give it a go?', quickReplies: ['How do I register?', 'Tell me about plans', 'How does it work?'] };
    }
  }
};

var chatFallbackReplies = [
  'Hmm, I\'m not quite sure about that one 🤔\n\nLet me connect you with our admin who can help!',
  'That\'s a good question but I\'m not the best person for that.\n\nOur admin team on WhatsApp can sort you out!',
  'I don\'t have the answer for that, but our admin team does! 👇'
];

function toggleChat() {
  var cw = document.getElementById('chatWindow');
  var badge = document.getElementById('chatBadge');
  if (!cw) return;
  chatOpen = !chatOpen;
  if (chatOpen) {
    cw.classList.add('open');
    if (badge) badge.style.display = 'none';
    if (!chatInit) { chatInit = true; initChat(); }
    setTimeout(function() { var inp = document.getElementById('chatInput'); if (inp) inp.focus(); }, 300);
  } else {
    cw.classList.remove('open');
  }
}
function initChat() {
  var hour = new Date().getHours();
  var greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  var name = (currentUser && currentUser.username) ? currentUser.username : 'there';
  addChatMsg('bot', greeting + ', ' + name + '! 👋\n\nI\'m the MJK assistant — I can help you with plans, payments, sports, account stuff, and more.\n\nWhat brings you here today?', ['Tell me about plans', 'How does it work?', 'I need help with my account', 'Just browsing']);
}
function addChatMsg(type, text, quickReplies) {
  var container = document.getElementById('chatMessages');
  if (!container) return;
  var div = document.createElement('div');
  div.className = 'chat-msg ' + type;
  div.innerHTML = text.replace(/\n/g, '<br>').replace(/\*(.*?)\*/g, '<b>$1</b>');
  container.appendChild(div);
  if (quickReplies && quickReplies.length > 0) {
    var row = document.createElement('div');
    row.className = 'chat-quick-row';
    for (var i = 0; i < quickReplies.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'chat-quick';
      btn.textContent = quickReplies[i];
      btn.setAttribute('data-msg', quickReplies[i]);
      btn.onclick = function() { sendChatText(this.getAttribute('data-msg')); };
      row.appendChild(btn);
    }
    container.appendChild(row);
  }
  container.scrollTop = container.scrollHeight;
}
function sendChatMessage() {
  var inp = document.getElementById('chatInput');
  if (!inp) return;
  var text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  sendChatText(text);
}
function sendChatText(text) {
  addChatMsg('user', text);
  chatHistory.push({ role: 'user', text: text });
  setTimeout(function() {
    var reply = getChatReply(text);
    addChatMsg('bot', reply.text, reply.quickReplies);
    chatHistory.push({ role: 'bot', text: reply.text });
  }, 400 + Math.random() * 600);
}
function getChatReply(input) {
  var lower = input.toLowerCase().replace(/[?!.,]/g, '').trim();
  for (var key in chatFlows) {
    var flow = chatFlows[key];
    for (var k = 0; k < flow.patterns.length; k++) {
      if (lower.indexOf(flow.patterns[k]) >= 0 || lower === flow.patterns[k]) {
        return flow.reply();
      }
    }
  }
  var fallbackText = chatFallbackReplies[Math.floor(Math.random() * chatFallbackReplies.length)];
  var msg = encodeURIComponent('Hi! I need help with MJK Betting Tips.');
  return { text: fallbackText + '\n\n📱 WhatsApp: 067 783 4591', quickReplies: ['Open WhatsApp', 'Go back to plans', 'Other questions'] };
}
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'chatInput') {
    sendChatMessage();
  }
});
