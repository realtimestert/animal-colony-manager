// SanusBio v2.2-beta.3 | 2026-09-16 | app-core.js
// v2.2-beta.3: Batch Care page (loadBatchCare) — baths, nail trims,
//          vaccinations for many animals at once.
// v2.2-beta.2: Emergency Vet Plan placeholder page (loadEmergencyVet).
// v2.2-beta.1: Print button on Weight & Grooming Alerts (printCareAlerts).
// v2.1-beta.11: Bug report inbox nav loader + admin open-count badge.
// v2.1-beta.9: Lighting is per-ferret (room toggle removed). canChangeLighting()
//          = all roles except cleaner. Move prompt lives in app-admin.js.
// v2.1-beta.7: Maternity board always shows feed-start (d21) + wean/chip (d42).
// v2.1-beta.6: Death log (required cause, necropsy notes/photos) — UI in app-ferrets.js
// v2.1-beta.5: Maternity display name is "Animal Care Lead"; stats/reports visible
// v2.1-beta.4: Maternity role can open Statistics and Reports (Users stays admin/research)
// v2.1-beta.3: fmtAid() for internal AID display
// v2.1-beta.2: Pending distribution dashboard card
// v2.1-beta.1: Research page + On Research dashboard card
// v2.1-beta.0: Statistics tab loader wired (loadStatistics)
// v2.0-beta.5: weeksSince(dateStr, endDateStr?) accepts optional end date so
//          Light Cycle weeks freeze at death_date / distribution_date.
// v2.0-beta.3: weeksSince() returns one-decimal weeks (matches ferretAge / Light History)
// v1.10.7: Dashboard boards collapsible (repro, care, vacc); Vaccinations Due
//          board; count badges on board headers; collapse state in localStorage
// v1.10.5: Assignments tab removed from navigation (feature unused); the
//          nav() loader map no longer routes to loadAssignments
// v1.10.6: (1) Weight & Grooming Alerts table is now sortable by Name,
//          Location, or Urgency (default); (2) dashboard "Overdue Tasks"
//          stat card removed — it was powered by the unused Assignments
//          feature and always read 0; (3) wired in the new Reports page
//          (loadReports, in app-reports.js) via the nav() loader map
// State, API, Auth, Init, Navigation, Dashboard, Helpers
// v1.9.4: added weeksSince() helper for light-schedule duration display
// v1.10.0: estrus board shows expected litter range for mated females;
//          dashboard surfaces females who died while active on the board
// v1.10.1: fixed stacked Bootstrap modal z-index (nested modals were covered)
// v1.10.2: FIX — Care Alerts functions (loadDashCareAlerts, setDashCareFilter,
//          openCareScheduleModal, etc.) were accidentally nested inside
//          loadDashboard(), so they were never callable from onclick=
//          handlers and loadDashCareAlerts() was never invoked, leaving the
//          Weight & Grooming Alerts card permanently hidden. Moved to
//          top-level scope and wired the call into loadDashboard().
// v1.10.4: FIX — Reproductive Status Board and Weight & Grooming Alerts row
//          clicks called loadFerretDetail(id) immediately followed by
//          nav('ferrets'), which re-ran the ferrets grid loader and switched
//          the page back to the grid, undoing the detail view that had just
//          been opened. Removed the nav('ferrets') call from both row
//          onclick handlers so clicking a row goes straight to that
//          ferret's detail page.

// ─── State ────────────────────────────────────────────────────────────────────
let TOKEN = localStorage.getItem('sb_token');
let USER = JSON.parse(localStorage.getItem('sb_user') || 'null');
let _editUserId = null, _editSupplierId = null, _currentFerretId = null;
let _ferretData = [], _searchTimer;

let _dashReproData = [], _dashReproFilter = null;
const DASH_REPRO_STATUS_META = {
  estrus:    { label: 'In Estrus',  color: 'danger' },
  mated:     { label: 'Mated',      color: 'warning' },
  littered:  { label: 'Littered',   color: 'success' },
  weaned:    { label: 'Weaned',     color: 'info' },
  no_litter: { label: 'No Litter',  color: 'secondary' },
};

let _dashCareData = [], _dashCareFilter = null, _dashCareSettings = null, _dashCareSort = 'urgency';
let _dashVaccData = [];

/** Toggle dashboard board collapse and remember preference. */
function toggleDashCollapse(bodyId, headerEl) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  // Bootstrap handles the collapse via data-bs-toggle; we just sync icon + storage after animation
  setTimeout(() => {
    const open = body.classList.contains('show');
    const icon = headerEl?.querySelector?.('.dash-collapse-icon')
      || headerEl?.closest?.('.card-header')?.querySelector?.('.dash-collapse-icon');
    if (icon) {
      icon.classList.toggle('bi-chevron-up', open);
      icon.classList.toggle('bi-chevron-down', !open);
    }
    try { localStorage.setItem('sb_collapse_' + bodyId, open ? '1' : '0'); } catch (_) {}
  }, 350);
}

function applySavedCollapse(bodyId) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  let saved = null;
  try { saved = localStorage.getItem('sb_collapse_' + bodyId); } catch (_) {}
  if (saved === null) return;
  const open = saved === '1';
  body.classList.toggle('show', open);
  const card = body.closest('.card');
  const icon = card?.querySelector?.('.dash-collapse-icon');
  if (icon) {
    icon.classList.toggle('bi-chevron-up', open);
    icon.classList.toggle('bi-chevron-down', !open);
  }
  const header = card?.querySelector?.('[data-bs-toggle="collapse"]');
  if (header) header.setAttribute('aria-expanded', open ? 'true' : 'false');
}

// ─── API Helper ───────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function apiUpload(path, formData) {
  const res = await fetch('/api' + path, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + TOKEN },
    body: formData
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(res.ok ? 'Unexpected upload response' : `Upload failed (HTTP ${res.status})`); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function roleIs(...r) { return r.includes(USER?.role); }
function canWrite() { return roleIs('admin', 'research', 'maternity', 'caretaker'); }
function canUpdate() { return roleIs('admin', 'research', 'maternity'); }
function canChangeLighting() { return canWrite(); }
function canDelete() { return roleIs('admin', 'research'); }
function canPurge() { return roleIs('admin'); }
function canUnassignRfid() { return roleIs('admin', 'research'); }

const ROLE_LABELS = {
  admin: 'Admin',
  research: 'Research',
  maternity: 'Animal Care Lead',
  caretaker: 'Caretaker',
  cleaner: 'Cleaner'
};
function roleLabel(role) { return ROLE_LABELS[role] || role || ''; }

function fmtAid(id) {
  if (id == null || id === '') return '—';
  const n = parseInt(String(id).replace(/^AID/i, ''), 10);
  if (!Number.isFinite(n) || n <= 0) return String(id);
  return 'AID' + String(n).padStart(5, '0');
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function doLogin() {
  const username = document.getElementById('iUser').value.trim();
  const password = document.getElementById('iPass').value;
  const errEl = document.getElementById('loginErr');
  errEl.classList.add('d-none');
  try {
    const data = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    }).then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error); return d; }));
    TOKEN = data.token; USER = data.user;
    localStorage.setItem('sb_token', TOKEN);
    localStorage.setItem('sb_user', JSON.stringify(USER));
    initApp();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('d-none'); }
}

function doLogout() {
  localStorage.removeItem('sb_token');
  localStorage.removeItem('sb_user');
  try {
    sessionStorage.removeItem('sb_page');
    sessionStorage.removeItem('sb_ferret');
    sessionStorage.removeItem('sb_photo_pending');
  } catch (_) {}
  location.reload();
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function initApp() {
  if (!TOKEN || !USER) {
    document.getElementById('loginWrap').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    return;
  }

  document.getElementById('loginWrap').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  if (typeof window.applyTheme === 'function') {
    var savedTheme = 'light';
    try {
      savedTheme = localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
    } catch (_) {}
    window.applyTheme(savedTheme);
  }
  document.getElementById('userInfo').innerHTML =
    `<div class="text-white fw-semibold small">${USER.full_name || USER.username}</div>
 <span class="badge role-${USER.role} role-badge">${roleLabel(USER.role)}</span>`;
  if (USER.role !== 'admin') document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  if (!['admin', 'research'].includes(USER.role)) document.querySelectorAll('.admin-research-only').forEach(el => el.style.display = 'none');
  if (!['admin', 'research', 'maternity'].includes(USER.role)) document.querySelectorAll('.admin-research-maternity-only').forEach(el => el.style.display = 'none');
  if (USER.role === 'cleaner') document.querySelectorAll('.hide-cleaner').forEach(el => el.style.display = 'none');
  if (roleIs('admin') && typeof refreshBugReportBadge === 'function') refreshBugReportBadge();
  document.getElementById('navLinks').querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => { e.preventDefault(); nav(link.dataset.page); });
  });
  const defaultPage = USER.role === 'cleaner' ? 'cleaning-reports' : 'dashboard';
  let savedPage = null, savedFerret = null, photoPending = null;
  try {
    savedPage = sessionStorage.getItem('sb_page');
    savedFerret = sessionStorage.getItem('sb_ferret');
    photoPending = sessionStorage.getItem('sb_photo_pending');
  } catch (_) {}
  // Android camera often kills the tab; restore the ferret instead of dumping
  // the user on the dashboard with a silently-lost photo.
  if (savedFerret && typeof loadFerretDetail === 'function') {
    loadFerretDetail(savedFerret);
    if (photoPending && String(photoPending) === String(savedFerret)) {
      try { sessionStorage.removeItem('sb_photo_pending'); } catch (_) {}
      setTimeout(() => {
        if (typeof openPhotoModal === 'function') openPhotoModal(savedFerret);
        alert('The phone camera app reloaded this page, so the photo was not kept. Use Take Photo (stays on this page) or Choose File, then tap Upload Photo.');
      }, 500);
    }
  } else {
    nav(savedPage || defaultPage);
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function nav(page) {
  try {
    sessionStorage.setItem('sb_page', page);
    if (page !== 'ferrets') sessionStorage.removeItem('sb_ferret');
  } catch (_) {}
  document.querySelectorAll('.page').forEach(p => p.classList.remove('show'));
  document.querySelectorAll('#navLinks .nav-link').forEach(l => l.classList.remove('active'));
  const p = document.getElementById('page-' + page);
  if (p) p.classList.add('show');
  const link = document.querySelector(`#navLinks [data-page="${page}"]`);
  if (link) link.classList.add('active');
  const loaders = {
    dashboard: loadDashboard, ferrets: loadFerrets, litters: loadLitters,
    locations: loadLocations, suppliers: loadSuppliers,
    users: loadUsers, activity: loadActivity, 'bug-reports': loadBugReports, 'cleaning-reports': loadCleaningReports,
    distribution: loadDistribution, research: loadResearchPage, reports: loadReports, statistics: loadStatistics,
    'emergency-vet': loadEmergencyVet,
    'batch-care': loadBatchCare
  };
  if (loaders[page]) loaders[page]();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const d = await api('/dashboard');
    document.getElementById('statCards').innerHTML = [
      { label: 'Active Ferrets', val: d.total, icon: 'bi-emoji-smile', color: 'primary' },
      { label: 'Pending Dist.', val: d.pending_distribution || 0, icon: 'bi-bookmark-check', color: 'secondary' },
      { label: 'On Research', val: d.on_research || 0, icon: 'bi-clipboard2-pulse', color: 'info' },
      ...(roleIs('admin', 'research') ? [{ label: 'Vaccines Due 30d', val: d.vacc_due, icon: 'bi-syringe', color: 'warning' }] : []),
      { label: 'Litters This Month', val: d.litters_this_month, icon: 'bi-egg', color: 'success' }
    ].map(s => `
  <div class="col-md-3 col-6">
    <div class="card stat-card p-3 d-flex flex-row align-items-center gap-3">
      <div class="icon bg-${s.color} bg-opacity-10 text-${s.color}"><i class="bi ${s.icon}"></i></div>
      <div><div class="fs-3 fw-bold">${s.val}</div><div class="text-muted small">${s.label}</div></div>
    </div>
  </div>`).join('');
  } catch (err) { console.error(err); }

  // Ferret lookup — all roles except cleaner
  if (USER?.role !== 'cleaner' && typeof initDashLookups === 'function') initDashLookups();

  // Estrus / Reproductive board — show to maternity, admin, research
  const estrusCard = document.getElementById('dashEstrusCard');
  if (estrusCard && roleIs('admin', 'research', 'maternity')) {
    estrusCard.style.display = '';
    try {
      _dashReproData = await api('/females/estrus');
      const cnt = document.getElementById('dashEstrusCount');
      if (cnt) cnt.textContent = _dashReproData.length;
      renderDashReproFilterBtns();
      renderDashReproTable();
      applySavedCollapse('dashEstrusBody');
    } catch (err) { console.error('Estrus board:', err); }
  } else if (estrusCard) {
    estrusCard.style.display = 'none';
  }

  // Weight & Grooming Care Alerts
  await loadDashCareAlerts();

  // Active Litters / Maternity Tasks
  await loadDashLitters();

  // Weeks into / out of Dark boards
  await loadDashLightCycleBoards();

  // Vaccinations Due board
  await loadDashVaccAlerts();

  // Females who died while active on the board (API returns last 7 days only)
  const diedCard = document.getElementById('dashDiedOnBoardCard');
  if (diedCard && roleIs('admin', 'research', 'maternity')) {
    try {
      const died = await api('/females/died-on-board');
      if (died.length) {
        diedCard.style.display = '';
        const STATUS_LABEL = { estrus: 'In Estrus', mated: 'Mated', littered: 'Littered', weaned: 'Weaned' };
        document.getElementById('dashDiedOnBoardList').innerHTML = died.map(f => `
          <tr style="cursor:pointer" onclick="loadFerretDetail(${f.id})">
            <td><strong>${f.name}</strong><br><span class="text-muted small">${f.animal_id || '—'}</span></td>
            <td><span class="badge bg-danger">${STATUS_LABEL[f.death_female_status] || f.death_female_status}</span></td>
            <td>${fmtDate(f.death_date)}</td>
            <td class="small text-muted">Room ${f.room_id || '?'} · ${f.cage_address || '?'}</td>
          </tr>`).join('');
      } else {
        diedCard.style.display = 'none';
      }
    } catch (err) { console.error('Died-on-board:', err); }
  } else if (diedCard) {
    diedCard.style.display = 'none';
  }
}

function renderDashReproFilterBtns() {
  const wrap = document.getElementById('dashReproFilterBtns');
  if (!wrap) return;
  const counts = {};
  _dashReproData.forEach(f => { counts[f.status] = (counts[f.status] || 0) + 1; });
  const cats = ['estrus', 'mated', 'littered'];
  wrap.innerHTML = `
    <button class="btn btn-sm ${_dashReproFilter === null ? 'btn-primary' : 'btn-outline-secondary'}"
      onclick="setDashReproFilter(null)">
      All <span class="badge bg-light text-dark ms-1">${_dashReproData.length}</span>
    </button>
    ${cats.map(c => {
      const m = DASH_REPRO_STATUS_META[c];
      const active = _dashReproFilter === c;
      return `<button class="btn btn-sm ${active ? 'btn-' + m.color : 'btn-outline-secondary'}"
        onclick="setDashReproFilter('${c}')">
        ${m.label} <span class="badge bg-light text-dark ms-1">${counts[c] || 0}</span>
      </button>`;
    }).join('')}`;
}

function setDashReproFilter(cat) {
  _dashReproFilter = cat;
  renderDashReproFilterBtns();
  renderDashReproTable();
}

function renderDashReproTable() {
  const tbody = document.getElementById('dashEstrusList');
  if (!tbody) return;
  const filtered = _dashReproFilter ? _dashReproData.filter(f => f.status === _dashReproFilter) : _dashReproData;
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted text-center py-3">No females in this category</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(f => {
    const m = DASH_REPRO_STATUS_META[f.status] || DASH_REPRO_STATUS_META.estrus;
    const daysSince = f.status_since ? Math.floor((Date.now() - new Date(f.status_since)) / 864e5) : null;
    const urgency = f.status === 'estrus' && daysSince !== null && daysSince >= 8;
    let litterLabel = '—';
    if (f.status === 'mated') {
      const start = f.expected_litter_start, end = f.expected_litter_end;
      if (start && end) litterLabel = (fmtDate(start) === fmtDate(end)) ? fmtDate(start) : `${fmtDate(start)} – ${fmtDate(end)}`;
      else if (start) litterLabel = fmtDate(start) + ' (est.)';
    }
    // Mated with no litter: allow return to baseline without opening the full ferret page
    const noLitterBtn = (f.status === 'mated' && typeof canUpdate === 'function' && canUpdate())
      ? `<button class="btn btn-sm btn-outline-secondary py-0 px-1" title="No litter — return to baseline"
           onclick="event.stopPropagation(); returnToBaseline(${f.id}, '${(f.name || '').replace(/'/g, "\\'")}')">
           <i class="bi bi-arrow-counterclockwise"></i></button>`
      : '';
    return `<tr class="${urgency ? 'table-danger' : ''}" style="cursor:pointer" onclick="loadFerretDetail(${f.id});">
      <td><strong>${f.name}</strong><br><span class="text-muted small">${f.animal_id || '—'}</span></td>
      <td><span class="badge bg-${m.color}">${m.label}</span> ${noLitterBtn}</td>
      <td>${f.status_since ? fmtDate(f.status_since) : '—'}</td>
      <td>${daysSince !== null ? daysSince + 'd' : '—'}${urgency ? ' <i class="bi bi-exclamation-triangle-fill text-danger ms-1"></i>' : ''}</td>
      <td class="small">${litterLabel}</td>
      <td class="small text-muted">Room ${f.room_id || '?'} · ${f.cage_address || '?'}</td>
      <td class="small text-muted">${(f.status_notes || '—').toString().slice(0, 80)}</td>
    </tr>`;
  }).join('');
}

/** Record no_litter and refresh the Reproductive Status Board. */
async function returnToBaseline(ferretId, name) {
  if (!confirm(`Mark ${name || 'this female'} as no litter and return her to baseline?\n\nShe will leave the Reproductive Status Board.`)) return;
  try {
    await api(`/ferrets/${ferretId}/no-litter`, { method: 'POST', body: { notes: 'No litter — returned to baseline (board)' } });
    // Refresh board in place
    _dashReproData = await api('/females/estrus');
    renderDashReproFilterBtns();
    renderDashReproTable();
  } catch (err) { alert(err.message); }
}

// ─── Active Litters / Maternity Tasks ───────────────────────────────────────────
let _dashLittersData = null;

async function loadDashLitters() {
  const card = document.getElementById('dashLittersCard');
  if (!card) return;
  if (!roleIs('admin', 'research', 'maternity')) { card.style.display = 'none'; return; }
  card.style.display = '';
  const tbody = document.getElementById('dashLittersList');
  const countEl = document.getElementById('dashLittersCount');
  const footer = document.getElementById('dashLittersFooter');
  if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>';
  try {
    const data = await api('/litters/active-tasks');
    _dashLittersData = data.litters || [];
    if (countEl) countEl.textContent = data.count || 0;
    if (!_dashLittersData.length) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-muted text-center py-4">No active litters needing care.</td></tr>';
      if (footer) footer.textContent = '';
      return;
    }
    const STATUS = {
      nursing: { label: 'Nursing', cls: 'success' },
      soft_feeding: { label: 'Soft food', cls: 'info' },
      weaned: { label: 'Wean window', cls: 'warning' },
      jill_removed: { label: 'Jill removed', cls: 'secondary' }
    };
    if (tbody) {
      tbody.innerHTML = _dashLittersData.map(L => {
        const st = STATUS[L.status] || { label: L.status, cls: 'secondary' };
        const taskHtml = (L.tasks || []).slice(0, 4).map(t =>
          `<span class="badge ${t.overdue ? 'bg-danger' : 'bg-warning text-dark'} me-1 mb-1">${t.label}${t.due ? ' · ' + t.due : ''}</span>`
        ).join('') || '<span class="text-muted small">—</span>';
        const ageLabel = L.age_weeks != null ? L.age_weeks : (L.age_days != null ? Math.round((L.age_days / 7) * 10) / 10 : '—');
        return `<tr style="cursor:pointer" onclick="openLitterDetailModal(${L.litter_log_id})">
          <td class="font-monospace small">${L.litter_id || '#' + L.litter_log_id}</td>
          <td><strong>${ageLabel}</strong> <span class="text-muted small">wk</span></td>
          <td><strong>${L.jill_name || '—'}</strong><br><span class="text-muted small">${L.jill_animal_id || ''}</span></td>
          <td>${L.surviving != null ? L.surviving : '—'}<span class="text-muted small">${L.kit_count != null ? ' / ' + L.kit_count : ''}</span></td>
          <td class="small text-muted">${L.address || '—'}</td>
          <td><span class="badge bg-${st.cls} bg-opacity-10 text-${st.cls}">${st.label}</span></td>
          <td class="small">${L.soft_food_start || '—'}</td>
          <td class="small">${L.wean_date || '—'}</td>
          <td class="small">${taskHtml}</td>
        </tr>`;
      }).join('');
    }
    const overdue = _dashLittersData.filter(L => L.has_overdue).length;
    if (footer) {
      footer.textContent = overdue
        ? `${overdue} litter(s) with overdue tasks · Nest every 14d · Soft food @21d · Wean/chip @42d · Weigh weekly (target ≥20 g/wk)`
        : `Nest every 14d · Soft food @21d · Wean/chip @42d · Weigh weekly (target ≥20 g/wk)`;
    }
    applySavedCollapse('dashLittersBody');
  } catch (err) {
    console.error('Active Litters board:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-danger text-center py-3">${err.message}</td></tr>`;
  }
}

function printMaternityTasks() {
  if (!_dashLittersData || !_dashLittersData.length) {
    alert('No active litters to print. Load the dashboard first.');
    return;
  }
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rows = _dashLittersData.map(L => {
    const ageLabel = L.age_weeks != null ? L.age_weeks + ' wk' : (L.age_days != null ? (Math.round((L.age_days / 7) * 10) / 10) + ' wk' : '—');
    const tasks = (L.tasks || []).map(t =>
      '<li style="' + (t.overdue ? 'color:#b91c1c;font-weight:600' : '') + '">' + esc(t.label) + (t.due ? ' — due ' + esc(t.due) : '') + '</li>'
    ).join('') || '<li style="color:#666">No pending tasks</li>';
    return '<tr>' +
      '<td style="padding:6px 8px;border:1px solid #ccc;font-family:monospace">' + esc(L.litter_id || L.litter_log_id) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ccc">' + esc(ageLabel) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ccc">' + esc(L.jill_name || '—') + '<br><span style="color:#666;font-size:11px">' + esc(L.jill_animal_id || '') + '</span></td>' +
      '<td style="padding:6px 8px;border:1px solid #ccc">' + esc(L.surviving != null ? L.surviving : '—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ccc">' + esc(L.address || '—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ccc">' + esc(L.status) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ccc">' + esc(L.soft_food_start || '—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ccc">' + esc(L.wean_date || '—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ccc"><ul style="margin:0;padding-left:16px">' + tasks + '</ul></td>' +
      '<td style="padding:6px 8px;border:1px solid #ccc;width:40px"></td>' +
      '</tr>';
  }).join('');

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Maternity Task Sheet — ' + esc(dateStr) + '</title>' +
    '<style>body{font-family:system-ui,-apple-system,sans-serif;font-size:13px;margin:16px;color:#111}' +
    'h1{font-size:18px;margin:0 0 4px}.meta{color:#555;margin-bottom:12px}' +
    'table{border-collapse:collapse;width:100%}' +
    'th{background:#f3f4f6;text-align:left;padding:6px 8px;border:1px solid #ccc;font-size:12px}' +
    '@media print{body{margin:8px}}</style></head><body>' +
    '<h1>Maternity Task Sheet</h1>' +
    '<div class="meta">' + esc(dateStr) + ' · ' + _dashLittersData.length +
    ' active litter(s) · Nest every 14 days · Soft food at 21 days · Wean/chip at 42 days · Weekly weigh (target ≥20 g/week)</div>' +
    '<table><thead><tr><th>Litter</th><th>Age</th><th>Jill</th><th>Kits</th><th>Location</th><th>Status</th><th>Feed start</th><th>Wean/chip</th><th>Tasks</th><th>✓</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>' +
    '<p class="meta" style="margin-top:12px">Generated ' + esc(now.toLocaleString()) + ' · Check boxes after completing each task.</p>' +
    '<script>window.onload=function(){window.print()}<\/script></body></html>';

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    URL.revokeObjectURL(url);
    alert('Pop-up blocked. Allow pop-ups for this site to print the maternity sheet.');
    return;
  }
  // Revoke after the new tab has a chance to load
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

function openPrintSheet(title, bodyHtml) {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
    '<style>body{font-family:system-ui,-apple-system,sans-serif;font-size:13px;margin:16px;color:#111}' +
    'h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:16px 0 6px}.meta{color:#555;margin-bottom:12px}' +
    'table{border-collapse:collapse;width:100%}' +
    'th{background:#f3f4f6;text-align:left;padding:6px 8px;border:1px solid #ccc;font-size:12px}' +
    'td{padding:6px 8px;border:1px solid #ccc}' +
    '@media print{body{margin:8px}}</style></head><body>' +
    bodyHtml +
    '<script>window.onload=function(){window.print()}<\/script></body></html>';
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    URL.revokeObjectURL(url);
    alert('Pop-up blocked. Allow pop-ups for this site to print.');
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

function printCareAlerts() {
  if (!_dashCareData || !_dashCareData.length) {
    alert('No weight or grooming alerts to print. Load the dashboard first.');
    return;
  }
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const base = _dashCareFilter ? _dashCareData.filter(DASH_CARE_FILTERS[_dashCareFilter]) : _dashCareData;
  const rows = sortDashCareData(base);
  const filterLabel = _dashCareFilter || 'all';
  const weightText = f => {
    if (f.weight_status === 'never') return 'Never weighed';
    if (f.weight_days != null) return f.weight_days + 'd ago' + (f.weight_status === 'red' ? ' (overdue)' : f.weight_status === 'yellow' ? ' (due)' : '');
    return '—';
  };
  const nailText = f => {
    if (f.nail_status === 'requested') return 'Requested';
    if (f.nail_status === 'overdue') return (f.nail_days != null ? f.nail_days + 'd ago' : 'Never') + ' (overdue)';
    return f.nail_days != null ? f.nail_days + 'd ago' : '—';
  };
  const bathText = f => {
    if (f.bath_status === 'this_week') return 'This week';
    if (f.bath_status === 'overdue') return 'Overdue';
    return '—';
  };
  const locText = f => 'R' + (f.room_id != null ? f.room_id : '?') + (f.cage_address ? ' ' + f.cage_address : '');
  const tr = rows.map(f =>
    '<tr><td>' + esc(f.name) + '<br><span style="color:#555;font-size:11px">' + esc(f.animal_id || '') +
    '</span></td><td>' + esc(weightText(f)) + '</td><td>' + esc(nailText(f)) +
    '</td><td>' + esc(bathText(f)) + '</td><td>' + esc(locText(f)) + '</td><td style="width:36px"></td></tr>'
  ).join('');
  const settings = _dashCareSettings || {};
  openPrintSheet('Weight & Grooming Alerts — ' + dateStr,
    '<h1>Weight &amp; Grooming Alerts</h1>' +
    '<div class="meta">' + esc(dateStr) + ' · ' + rows.length + ' ferret(s) · filter: ' + esc(filterLabel) +
    ' · Nail every ' + esc(settings.nail_trim_interval_days || '—') + 'd · Bath when checked · Weight warn ' +
    esc(settings.weight_warn_days || '—') + 'd / critical ' + esc(settings.weight_critical_days || '—') + 'd</div>' +
    '<table><thead><tr><th>Ferret</th><th>Weight</th><th>Nail trim</th><th>Bath</th><th>Location</th><th>✓</th></tr></thead>' +
    '<tbody>' + (tr || '<tr><td colspan="6">None</td></tr>') + '</tbody></table>' +
    '<p class="meta" style="margin-top:12px">Generated ' + esc(now.toLocaleString()) + '</p>');
}

// ─── Weight & Grooming Care Alerts ──────────────────────────────────────────────
// v1.10.2 FIX: these were previously nested inside loadDashboard(), which meant
// (a) they weren't in global scope, so onclick="setDashCareFilter(...)" and
//     onclick="openCareScheduleModal()" handlers in index.html threw
//     "is not defined" errors, and
// (b) loadDashCareAlerts() was never actually invoked, so the card never loaded.
async function loadDashCareAlerts() {
  const card = document.getElementById('dashCareCard');
  if (!card) return;
  if (USER?.role === 'cleaner') { card.style.display = 'none'; return; }
  card.style.display = '';
  try {
    const data = await api('/ferrets/care-alerts');
    _dashCareSettings = data.settings;
    _dashCareData = data.ferrets;
    const cnt = document.getElementById('dashCareCount');
    if (cnt) cnt.textContent = _dashCareData.length;
    renderDashCareFilterBtns();
    renderDashCareTable();
    applySavedCollapse('dashCareBody');
    const footer = document.getElementById('dashCareFooter');
    if (footer) footer.innerHTML = `<i class="bi bi-info-circle me-1"></i>Nail trim every ${_dashCareSettings.nail_trim_interval_days}d · Bath when someone checks “needs a bath” (this week) · Weight check every ${_dashCareSettings.weight_warn_days}d (yellow) / ${_dashCareSettings.weight_critical_days}d (red)`;
  } catch (err) { console.error('Care alerts:', err); }
}

function _normSex(s) {
  if (!s) return null;
  const v = String(s).toLowerCase();
  if (v === 'f' || v === 'female') return 'female';
  if (v === 'm' || v === 'male') return 'male';
  return null;
}

function _lightCycleRow(f) {
  const loc = `Room ${f.room_id || '?'}${f.cage_address ? ' · ' + f.cage_address : ''}${f.room_lighting ? ' · ' + f.room_lighting : ''}`;
  const ageLabel = f.age_weeks != null ? `${f.age_weeks}w` : '—';
  return `<tr style="cursor:pointer" onclick="loadFerretDetail(${f.id})">
    <td><strong>${f.name}</strong><br><span class="text-muted small">${f.animal_id != null ? 'AID' + String(f.animal_id).padStart(5, '0') : '—'}</span></td>
    <td><strong>${f.weeks_on_cycle != null ? f.weeks_on_cycle : '—'}</strong>
        <span class="text-muted small ms-1">(${f.days_on_cycle != null ? f.days_on_cycle + 'd' : '—'})</span></td>
    <td>${fmtDate(f.light_state_since)}</td>
    <td class="small">${ageLabel}</td>
    <td class="small text-muted">${loc}</td>
  </tr>`;
}

function _fillDarkBoard(cardId, bodyId, listId, countId, rows) {
  const card = document.getElementById(cardId);
  if (!card) return;
  if (!rows.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  const cnt = document.getElementById(countId);
  if (cnt) cnt.textContent = rows.length;
  const tbody = document.getElementById(listId);
  if (tbody) tbody.innerHTML = rows.map(_lightCycleRow).join('');
  applySavedCollapse(bodyId);
}

async function loadDashLightCycleBoards() {
  const cardIds = ['dashDarkInFCard', 'dashDarkOutFCard'];
  if (USER?.role === 'cleaner') {
    cardIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    return;
  }
  try {
    const data = await api('/ferrets/light-cycle-boards');
    const intoDark = data.into_dark || data.intoDark || [];
    const outOfDark = data.out_of_dark || data.outOfDark || [];

    const intoF = intoDark.filter(f => _normSex(f.sex) === 'female');
    const outF = outOfDark.filter(f => _normSex(f.sex) === 'female');

    _fillDarkBoard('dashDarkInFCard', 'dashDarkInFBody', 'dashDarkInFList', 'dashDarkInFCount', intoF);
    _fillDarkBoard('dashDarkOutFCard', 'dashDarkOutFBody', 'dashDarkOutFList', 'dashDarkOutFCount', outF);
  } catch (err) {
    console.error('Light cycle boards:', err);
    cardIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }
}

async function loadDashVaccAlerts() {
  const card = document.getElementById('dashVaccCard');
  if (!card) return;
  if (!roleIs('admin', 'research')) { card.style.display = 'none'; return; }
  try {
    _dashVaccData = await api('/ferrets/vaccinations-due?days=30');
    if (!_dashVaccData.length) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';
    const cnt = document.getElementById('dashVaccCount');
    if (cnt) cnt.textContent = _dashVaccData.length;
    const tbody = document.getElementById('dashVaccList');
    if (!tbody) return;
    tbody.innerHTML = _dashVaccData.map(f => {
      const overdue = f.days_until != null && f.days_until < 0;
      const dueToday = f.days_until === 0;
      const daysLabel = f.days_until == null ? '—'
        : overdue ? `${Math.abs(f.days_until)}d overdue`
        : dueToday ? 'Due today'
        : `in ${f.days_until}d`;
      return `<tr class="${overdue ? 'table-danger' : (dueToday ? 'table-warning' : '')}"
                  style="cursor:pointer" onclick="loadFerretDetail(${f.id})">
        <td><strong>${f.name}</strong><br><span class="text-muted small">${f.animal_id || '—'}</span></td>
        <td>${fmtDate(f.next_rabies_vaccine_due)}</td>
        <td>${daysLabel}</td>
        <td class="small text-muted">Room ${f.room_id || '?'} · ${f.cage_address || '?'}</td>
        <td class="small">${canUpdate() ? '<span class="text-muted">Open to record →</span>' : ''}</td>
      </tr>`;
    }).join('');
    applySavedCollapse('dashVaccBody');
  } catch (err) {
    console.error('Vaccinations due:', err);
    card.style.display = 'none';
  }
}

const DASH_CARE_FILTERS = {
  weight_never:  f => f.weight_status === 'never',
  weight_red:    f => f.weight_status === 'red',
  weight_yellow: f => f.weight_status === 'yellow',
  nail_overdue:  f => f.nail_status === 'overdue' || f.nail_status === 'requested',
  bath_overdue:  f => f.bath_status === 'this_week' || f.bath_status === 'overdue'
};

function renderDashCareFilterBtns() {
  const wrap = document.getElementById('dashCareFilterBtns');
  if (!wrap) return;
  const counts = Object.fromEntries(Object.entries(DASH_CARE_FILTERS).map(([k, fn]) => [k, _dashCareData.filter(fn).length]));
  const btn = (key, label, color) => `<button class="btn btn-sm ${_dashCareFilter === key ? 'btn-' + color : 'btn-outline-secondary'}"
    onclick="setDashCareFilter('${key}')">${label} <span class="badge bg-light text-dark ms-1">${counts[key]}</span></button>`;
  wrap.innerHTML =
    `<button class="btn btn-sm ${_dashCareFilter === null ? 'btn-primary' : 'btn-outline-secondary'}" onclick="setDashCareFilter(null)">
      All <span class="badge bg-light text-dark ms-1">${_dashCareData.length}</span></button>` +
    btn('weight_never', 'Never Weighed', 'dark') +
    btn('weight_red', 'Weight 45d+', 'danger') +
    btn('weight_yellow', 'Weight 30d+', 'warning') +
    btn('nail_overdue', 'Nail Trim', 'secondary') +
    btn('bath_overdue', 'Bath this week', 'secondary');
}

function setDashCareFilter(key) {
  _dashCareFilter = key;
  renderDashCareFilterBtns();
  renderDashCareTable();
}

function setDashCareSort(val) {
  _dashCareSort = val;
  renderDashCareTable();
}

function sortDashCareData(arr) {
  const sorted = [...arr];
  if (_dashCareSort === 'name') {
    sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (_dashCareSort === 'location') {
    sorted.sort((a, b) => {
      const ra = a.room_id ?? 9999, rb = b.room_id ?? 9999;
      if (ra !== rb) return ra - rb;
      return (a.cage_address || '').localeCompare(b.cage_address || '');
    });
  }
  // 'urgency' — leave in the order the API returned (already worst-first)
  return sorted;
}

function renderDashCareTable() {
  const tbody = document.getElementById('dashCareList');
  if (!tbody) return;
  const base = _dashCareFilter ? _dashCareData.filter(DASH_CARE_FILTERS[_dashCareFilter]) : _dashCareData;
  const filtered = sortDashCareData(base);
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-center py-3">No ferrets need attention 🎉</td></tr>';
    return;
  }
  const weightBadge = f => {
    if (f.weight_status === 'never') return '<span class="badge bg-dark">Never Weighed</span>';
    if (f.weight_status === 'red') return `<span class="badge bg-danger">${f.weight_days}d ago</span>`;
    if (f.weight_status === 'yellow') return `<span class="badge bg-warning text-dark">${f.weight_days}d ago</span>`;
    return `<span class="text-muted small">${f.weight_days}d ago</span>`;
  };
  const nailBadge = f => {
    if (f.nail_status === 'overdue') return `<span class="badge bg-danger">${f.nail_days != null ? f.nail_days + 'd ago' : 'Never'}</span>`;
    if (f.nail_status === 'requested') return '<span class="badge bg-warning text-dark">Requested</span>';
    return f.nail_days != null ? `<span class="text-muted small">${f.nail_days}d ago</span>` : '<span class="text-muted small">—</span>';
  };
  const bathBadge = f => {
    if (f.bath_status === 'this_week') return '<span class="badge bg-warning text-dark">This week</span>';
    if (f.bath_status === 'overdue') return '<span class="badge bg-danger">Overdue</span>';
    return '<span class="text-muted small">—</span>';
  };
  tbody.innerHTML = filtered.map(f => `
    <tr style="cursor:pointer" onclick="loadFerretDetail(${f.id});">
      <td><strong>${f.name}</strong><br><span class="text-muted small">${f.animal_id || '—'}</span></td>
      <td>${weightBadge(f)}</td>
      <td>${nailBadge(f)}</td>
      <td>${bathBadge(f)}</td>
      <td class="small text-muted">Room ${f.room_id || '?'} · ${f.cage_address || '?'}</td>
    </tr>`).join('');
}

async function openCareScheduleModal() {
  try {
    const s = _dashCareSettings || await api('/care-schedule');
    document.getElementById('csNailInterval').value = s.nail_trim_interval_days;
    document.getElementById('csWeightWarn').value = s.weight_warn_days;
    document.getElementById('csWeightCritical').value = s.weight_critical_days;
    new bootstrap.Modal(document.getElementById('careScheduleModal')).show();
  } catch (err) { alert(err.message); }
}

async function submitCareSchedule() {
  try {
    await api('/care-schedule', {
      method: 'PUT', body: {
        nail_trim_interval_days: parseInt(document.getElementById('csNailInterval').value) || 180,
        weight_warn_days: parseInt(document.getElementById('csWeightWarn').value) || 30,
        weight_critical_days: parseInt(document.getElementById('csWeightCritical').value) || 45
      }
    });
    bootstrap.Modal.getInstance(document.getElementById('careScheduleModal')).hide();
    loadDashCareAlerts();
  } catch (err) { alert(err.message); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }
function nowTime() { return new Date().toTimeString().slice(0, 5); }
function fmtDate(d) {
  if (!d) return '—';
  const s = d.toString().split('T')[0];
  const [y, m, dy] = s.split('-');
  return `${m}-${dy}-${y}`;
}
function fmtTime(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  let h = d.getHours(), min = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min.toString().padStart(2, '0')} ${ampm}`;
}
function fmtDT(dt) { if (!dt) return '—'; return `${fmtDate(dt)} ${fmtTime(dt)}`; }
function weeksSince(dateStr, endDateStr) {
  if (!dateStr) return null;
  const start = new Date(dateStr);
  const end = endDateStr ? new Date(endDateStr) : new Date();
  const days = Math.floor((end - start) / 864e5);
  if (days < 0) return '0.0';
  return (days / 7).toFixed(1);
}

// ─── Stacked Modal Fix ─────────────────────────────────────────────────────────
// Bootstrap doesn't bump z-index for a modal opened from within another modal
// (e.g. Log Kit Death opened on top of Litter Care Details), so the new modal
// and its backdrop can end up rendering *behind* the modal it was opened from.
// Give each successively-opened modal (and its backdrop) a higher z-index.
document.addEventListener('show.bs.modal', e => {
  const openCount = document.querySelectorAll('.modal.show').length;
  if (!openCount) return;
  const zIndex = 1055 + openCount * 20;
  e.target.style.zIndex = zIndex;
  setTimeout(() => {
    const backdrops = document.querySelectorAll('.modal-backdrop');
    const topBackdrop = backdrops[backdrops.length - 1];
    if (topBackdrop) topBackdrop.style.zIndex = zIndex - 5;
  }, 0);
});

// ─── DOMContentLoaded bootstrap ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ferretSearch')?.addEventListener('input', e => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => loadFerrets(e.target.value), 300);
  });
  document.getElementById('iPass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  // Drag & drop for ferret photo zone
  const zone = document.getElementById('ferretPhotoZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) { document.getElementById('fPhotoFile').files = e.dataTransfer.files; previewPhoto(document.getElementById('fPhotoFile'), 'fPhotoPreview'); }
    });
  }
  initApp();
});