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
  if (currentUser) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (registerBtn) registerBtn.style.display = 'none';
    if (userMenu) { userMenu.style.display = ''; document.getElementById('userName').textContent = currentUser.username; }
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
function showAuthModal(mode) {
  var m = document.getElementById('authModal');
  if (!m) return;
  m.style.display = 'flex';
  setTimeout(function() { m.classList.add('open'); }, 10);
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
  if (m) { m.classList.remove('open'); setTimeout(function() { m.style.display = 'none'; }, 300); }
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
  if (modal) { modal.style.display = 'flex'; setTimeout(function() { modal.classList.add('open'); }, 10); }
}

// === PUSH NOTIFICATIONS ===
function requestPushNotification() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') return;
  var dismissed = localStorage.getItem('mjk_push_dismissed');
  if (dismissed) return;
  var prompt = document.getElementById('pushPrompt');
  if (prompt) setTimeout(function() { prompt.style.display = 'flex'; }, 5000);
}
function enablePushNotifications() {
  if (!('Notification' in window)) { showToast('Notifications not supported', 'error'); return; }
  Notification.requestPermission().then(function(perm) {
    if (perm === 'granted') showToast('Notifications enabled!', 'success');
    else showToast('Notifications blocked by browser', 'info');
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
  if (name === 'admin') { loadAdminUsers(); loadAdminStats(); loadBacktest(); }
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
    var roleIcon = u.role === 'admin' ? '<span style="margin-right:4px;">👑</span>' : '';
    var created = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-ZA') : '';
    html += '<div class="admin-user-row" onclick="selectAdminUser(\'' + u.username + '\',\'' + u.tier + '\')">' +
      '<div style="display:flex;align-items:center;gap:8px;min-width:0;"><span style="font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + roleIcon + u.username + '</span> <span class="tier-badge tier-' + u.tier + '">' + u.tier + '</span></div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0;"><span style="color:var(--muted);font-size:11px;">' + created + '</span>' +
      '<select class="admin-select" style="padding:4px 8px;font-size:11px;min-height:auto;" onclick="event.stopPropagation()" onchange="quickSetTier(\'' + u.username + '\',this.value)">' +
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
  var oddsHtml = '<div style="text-align:right;flex-shrink:0;"><div class="tip-odds">'+t.odds+'</div><div class="tip-odds-label">AI ODDS</div></div>';
  if (t.realOdds && t.realOdds.home) {
    var isHomePick = t.pick && t.match && t.pick.indexOf(t.match.split(' vs ')[0]) !== -1;
    var realPrice = t.pick.indexOf('Win') !== -1 ? (isHomePick ? t.realOdds.home : t.realOdds.away) : (t.realOdds.home || t.realOdds.away);
    if (t.realOdds.draw && t.pick === 'Draw') realPrice = t.realOdds.draw;
    oddsHtml = '<div style="text-align:right;flex-shrink:0;"><div class="tip-odds">'+t.odds+'</div><div class="tip-odds-label">AI ODDS</div></div><div style="text-align:right;margin-top:4px;flex-shrink:0;"><div class="tip-odds" style="font-size:22px;background:linear-gradient(135deg,var(--gold),var(--gold-dark));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">'+(realPrice ? realPrice.toFixed(2) : '')+'</div><div class="tip-odds-label">'+(t.bookmaker||'')+'</div></div>';
  }
  var valueBadge = t.valueBet ? '<span class="value-badge">VALUE BET</span>' : '';
  var btn = accaIdx !== undefined ? '<button class="add-acca-btn" id="ab'+accaIdx+'" onclick="toggleAcca('+accaIdx+')">+ Add to Acca</button>' : '';
  var shareBtn = '<div class="tip-share-row"><button class="share-btn share-wa" onclick="shareTip(\'' + encodeURIComponent(t.match) + '\',\'' + encodeURIComponent(t.pick + ' @ ' + t.odds + ' (' + t.conf + '%)') + '\',\'whatsapp\')">WhatsApp</button><button class="share-btn share-tw" onclick="shareTip(\'' + encodeURIComponent(t.match) + '\',\'' + encodeURIComponent(t.pick + ' @ ' + t.odds + ' (' + t.conf + '%)') + '\',\'twitter\')">Twitter</button><button class="share-btn share-copy" onclick="shareTip(\'' + encodeURIComponent(t.match) + '\',\'' + encodeURIComponent(t.pick + ' @ ' + t.odds + ' (' + t.conf + '%)') + '\',\'copy\')">Copy</button></div>';
  var leagueHtml = t.league ? '<span class="league-chip">'+t.league+'</span>' : '';
  var countryHtml = country ? '<span class="country-chip">'+country+'</span>' : '';
  var mktBadge = '';
  if (t.marketType === 'ou') mktBadge = '<span class="mkt-badge ou">O/U</span>';
  else if (t.marketType === 'btts') mktBadge = '<span class="mkt-badge btts">BTTS</span>';
  else if (t.marketType === 'h2h') mktBadge = '<span class="mkt-badge h2h">1X2</span>';
  return '<div class="tip-card'+(t.valueBet?' value-card':'')+'" data-type="'+(t.type||'')+'" data-conf="'+t.conf+'" data-match="'+(t.match||'').toLowerCase()+'" data-league="'+(t.league||'').toLowerCase()+'"><div class="tip-sport-bar '+sportClass+'"><span>'+icon+' '+(t.sport||'Sport')+'</span>'+countryHtml+leagueHtml+mktBadge+'</div><div class="tip-body"><div class="tip-match">'+t.match+'</div><div class="tip-time">🕐 '+timeStr+'</div><div class="tip-pick"><div style="min-width:0;"><div class="tip-pick-label">'+t.market+'</div><div class="tip-pick-val">'+t.pick+' '+valueBadge+'</div></div>'+oddsHtml+'</div><div class="conf-bar"><div class="conf-fill" style="width:'+t.conf+'%;background:linear-gradient(90deg,'+c+'88,'+c+')"></div></div><div class="tip-footer"><span style="color:'+c+';font-weight:700">★ '+t.conf+'% Confidence</span><span class="tip-status">⏳ Pending</span></div><div class="banker-reason" style="margin-top:10px;font-size:11px;">'+t.reason+'</div>'+btn+shareBtn+'</div></div>';
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
  var leagueHtml = b.league ? '<span class="league-chip-sm">'+b.league+'</span>' : '';
  var countryHtml = country ? '<span class="country-chip-sm">'+country+'</span>' : '';
  return '<div class="banker-card'+(b.valueBet?' value-card':'')+'"><span class="banker-tag">⭐ Banker '+(n+1)+'</span><div class="banker-match">'+icon+' '+b.match+'</div><div class="banker-meta">'+leagueHtml+countryHtml+' · '+timeStr+'</div><div class="banker-reason">'+b.reason+'</div><div class="banker-foot"><div><div class="banker-pick-label">'+b.market+'</div><div class="banker-pick-val">'+b.pick+valueBadge+'</div></div><div class="banker-odds-big">'+b.odds+'</div></div>'+realOddsHtml+'<div class="banker-bar"><div class="banker-fill" style="width:'+b.conf+'%;background:linear-gradient(90deg,'+c+','+c+')"></div></div><div class="banker-conf">★ '+b.conf+'% Confidence</div></div>';
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
      if (matchText.indexOf(score.homeScore) !== -1 || true) {
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
      html += '<span class="ticker-item">⚽ ' + BANKERS[i].match + '<span class="sep">|</span>' + BANKERS[i].pick + ' @ ' + BANKERS[i].odds + '</span>';
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
    { key:'starter', name:'Starter', price:'R700', period:'per week', what:'10 tips + Telegram alerts', features:['10 tips daily','Daily banker picks','Telegram alerts','All sports (exc. horse racing)'], btn:'Subscribe', featured:false },
    { key:'pro', name:'Pro', price:'R2500', period:'per week', what:'25 tips + VIP tools + Horse Racing', features:['25 tips daily','Horse racing tips','Acca builder','ROI dashboard','Accumulator tips','Correct score tips'], btn:'Subscribe', featured:true },
    { key:'elite', name:'Elite', price:'R6570', period:'per month', what:'30 tips + Horse Racing + everything', features:['30 tips daily','Horse racing tips','Sport filtering','Monthly reports','1-on-1 consultations','Early access 6am SAST'], btn:'Subscribe', featured:false }
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
    { key:'starter', name:'Starter', price:'R700', period:'per week', features:['10 tips daily','Telegram alerts','Daily banker picks'] },
    { key:'pro', name:'Pro', price:'R2500', period:'per week', features:['25 tips daily','Horse racing tips','Acca builder','ROI dashboard','Correct score tips','Accumulators'] },
    { key:'elite', name:'Elite', price:'R6570', period:'per month', features:['30 tips daily','Horse racing tips','Sport filtering','Monthly reports','1-on-1 coaching','Early access'] }
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
  m.style.display = 'flex';
  setTimeout(function() { m.classList.add('open'); }, 10);
  document.getElementById('subTitle').textContent = plan + ' Plan — ' + price;
  document.getElementById('subDesc').textContent = 'Contact us to activate your plan. Admin will upgrade within 1 hour of payment confirmation.';
  var waLink = document.getElementById('subWaLink');
  if (waLink) {
    waLink.style.display = 'flex';
    waLink.href = 'https://wa.me/27677834591?text=' + encodeURIComponent('Hi MJK, I want to upgrade to the ' + plan + ' plan (' + price + '/week). My username is: ' + currentUser.username);
    waLink.textContent = '💬 Chat on WhatsApp to Pay';
  }
}
function closeSub() {
  var m = document.getElementById('subModal');
  if (m) { m.classList.remove('open'); setTimeout(function() { m.style.display = 'none'; }, 300); }
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
  var icons = { 'soccer_fifa_world_cup':'⚽','soccer_epl':'⚽','tennis_atp_wimbledon':'🎾','tennis_wta_wimbledon':'🎾','americanfootball_nfl':'🏈','rugbyleague_nrl':'🏉','baseball_mlb':'⚾','aussierules_afl':'🏉','cricket_international_t20':'🏏','horse_racing':'🏇' };
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
  updateAuthUI();
  if (currentUser) startSessionTimer();
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
  }
});
