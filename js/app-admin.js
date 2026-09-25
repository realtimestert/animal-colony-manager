// SanusBio v2.1-beta.11 | 2026-09-09 | app-admin.js
// Locations, Suppliers, Users, Activity Log, Bug Reports, Distribution Page
// v2.1-beta.11: Staff bug / change reports. Sidebar modal submits to admin
//          inbox (page-bug-reports). Activity Log also records BUG_REPORT.
// v2.1-beta.10: Activity Log colors include PRINT (ferret card print).
// v2.1-beta.9: Room lighting toggle removed. Move modal asks keep-or-change
//          for the ferret's own light schedule. Lighting follows the animal.
// v2.1-beta.8: Activity Log user column shows full name (username in parens)
// v1.9.5: room light schedule reverted to on/off only — duration now tracked
//         per ferret (see app-ferrets.js) since it must follow the animal
// v1.9.6: removed Assignments tab functions (feature unused, tab removed
//         from navigation) — the /api/assignments backend routes are left
//         in place but are no longer called from the UI
// v1.9.7: Move Location modal no longer asks for cage position (Top/Middle/
//         Bottom/None) — the position is already fixed to the cage letter
//         when the location is created, so re-selecting it on every move
//         was redundant and risked accidentally clearing it

// ─── Locations ────────────────────────────────────────────────────────────────
async function loadLocations() {
  if (roleIs('admin', 'research')) document.getElementById('btnAddLocationMain').classList.remove('d-none');
  try {
    const addresses = await api('/addresses');
    const accordion = document.getElementById('locationAccordion');
    if (!addresses.length) { accordion.innerHTML = '<div class="text-muted mt-2">No locations yet.</div>'; return; }
    const canDeleteLoc = roleIs('admin', 'research');
    accordion.innerHTML = addresses.map((a, i) => `
  <div class="accordion-item">
    <h2 class="accordion-header d-flex align-items-center">
      <button class="accordion-button flex-grow-1 ${i === 0 ? '' : 'collapsed'}" type="button"
        data-bs-toggle="collapse" data-bs-target="#loc${a.address_id}">
        Room ${a.room_id}${a.room_name ? ' ' + a.room_name : ''} · Cage ${a.cage_address || '—'}
        ${a.room_lighting ? `<span class="text-muted small ms-2">(${a.room_lighting})</span>` : ''}
      </button>
      ${canDeleteLoc ? `<button class="btn btn-sm btn-outline-danger me-2 flex-shrink-0" style="z-index:1"
        onclick="deleteLocation(${a.address_id}, 'Room ${a.room_id} · Cage ${a.cage_address || '?'}')">
        <i class="bi bi-trash"></i>
      </button>` : ''}
    </h2>
    <div id="loc${a.address_id}" class="accordion-collapse collapse ${i === 0 ? 'show' : ''}">
      <div class="accordion-body p-2">
        <div id="locFerrets${a.address_id}" class="text-muted small">Loading…</div>
      </div>
    </div>
  </div>`).join('');
    for (const a of addresses) {
      try {
        const ferrets = await api(`/addresses/${a.address_id}/ferrets`);
        const el = document.getElementById(`locFerrets${a.address_id}`);
        if (!ferrets.length) { el.innerHTML = '<em>No active ferrets in this location.</em>'; }
        else {
          el.innerHTML = `<table class="table table-sm mb-0">
      <thead><tr><th>Name</th><th>ID</th><th>Sex</th><th>Weight</th></tr></thead>
      <tbody>${ferrets.map(f => `
        <tr style="cursor:pointer" onclick="loadFerretDetail(${f.id})">
          <td><strong>${f.name}</strong></td>
          <td class="text-muted">${f.animal_id || '—'}</td>
          <td>${f.sex ? f.sex.charAt(0).toUpperCase() + f.sex.slice(1) : '—'}</td>
          <td>${f.weight ? f.weight + ' g' : '—'}</td>
        </tr>`).join('')}
      </tbody></table>`;
        }
      } catch { /* skip */ }
    }
  } catch (err) { console.error(err); }
}

async function deleteLocation(id, label) {
  if (!confirm(`Delete "${label}"?\n\nThis will fail if any ferrets are assigned here.`)) return;
  try {
    await api(`/addresses/${id}`, { method: 'DELETE' });
    loadLocations();
  } catch (err) { alert(err.message); }
}

function syncMoveLightFields() {
  const change = document.getElementById('moveLightChange')?.checked;
  const fields = document.getElementById('moveLightChangeFields');
  if (fields) fields.classList.toggle('d-none', !change);
  if (change) {
    const since = document.getElementById('moveLightSince');
    const moveDate = document.getElementById('moveDate')?.value || today();
    if (since) since.value = moveDate;
  }
}

async function openMoveModal(ferretId) {
  document.getElementById('moveFerretId').value = ferretId;
  document.getElementById('moveDate').value = today();
  const keep = document.getElementById('moveLightKeep');
  const change = document.getElementById('moveLightChange');
  if (keep) keep.checked = true;
  if (change) change.checked = false;
  const since = document.getElementById('moveLightSince');
  if (since) since.value = today();
  syncMoveLightFields();
  const currentEl = document.getElementById('moveLightCurrent');
  if (currentEl) currentEl.textContent = 'Loading current schedule…';
  try {
    const [addresses, ferret] = await Promise.all([
      api('/addresses'),
      api(`/ferrets/${ferretId}`)
    ]);
    document.getElementById('moveAddrId').innerHTML = addresses.map(a => {
      const label = `Room ${a.room_id}${a.room_name ? ' ' + a.room_name : ''} · Cage ${a.cage_address || '?'}${a.room_lighting ? ' · ' + a.room_lighting : ''}`;
      return `<option value="${a.address_id}">${label}</option>`;
    }).join('');
    const cycle = ferret.eight_hour_light ? '8-Hour (Winter)' : 'Standard (Summer / 16-hour)';
    const sinceLabel = ferret.light_state_since ? fmtDate(ferret.light_state_since) : 'unknown date';
    const wks = ferret.light_state_since && typeof weeksSince === 'function' ? weeksSince(ferret.light_state_since) : null;
    if (currentEl) {
      currentEl.textContent = `Currently ${cycle} since ${sinceLabel}${wks != null ? ` (${wks} wk)` : ''}.`;
    }
    const valueEl = document.getElementById('moveLightValue');
    if (valueEl) valueEl.value = ferret.eight_hour_light ? '1' : '0';
    new bootstrap.Modal(document.getElementById('moveModal')).show();
  } catch (err) { alert(err.message); }
}

async function submitMove() {
  const ferretId = document.getElementById('moveFerretId').value;
  const address_id = document.getElementById('moveAddrId').value;
  const move_date = document.getElementById('moveDate').value || today();
  const light_action = document.querySelector('input[name="moveLightAction"]:checked')?.value || 'keep';
  const body = { address_id: parseInt(address_id), move_date, light_action };
  if (light_action === 'change') {
    body.eight_hour_light = document.getElementById('moveLightValue').value === '1';
    body.light_state_since = document.getElementById('moveLightSince').value || move_date;
    if (!body.light_state_since) return alert('Please choose a since-date for the new light schedule.');
  }
  try {
    await api(`/ferrets/${ferretId}/location`, { method: 'PUT', body });
    bootstrap.Modal.getInstance(document.getElementById('moveModal')).hide();
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

async function submitAddress() {
  const room = document.getElementById('adRoom').value;
  if (!room) return alert('Room ID is required');
  const position = document.querySelector('input[name="adPosition"]:checked')?.value || null;
  try {
    await api('/addresses', {
      method: 'POST', body: {
        room_id: parseInt(room),
        room_name: document.getElementById('adRoomName').value || null,
        cage_address: document.getElementById('adCage').value || null,
        room_lighting: position || null
      }
    });
    bootstrap.Modal.getInstance(document.getElementById('addrModal')).hide();
    document.getElementById('adRoom').value = '';
    document.getElementById('adRoomName').value = '';
    document.getElementById('adCage').value = '';
    document.getElementById('adPosNone').checked = true;
    alert('Location added!');
  } catch (err) { alert(err.message); }
}

// ─── Suppliers Page ───────────────────────────────────────────────────────────
async function loadSuppliers() {
  if (roleIs('admin', 'research')) document.getElementById('btnAddSupplierMain').classList.remove('d-none');
  try {
    const suppliers = await api('/suppliers');
    const container = document.getElementById('supplierCards');
    if (!suppliers.length) { container.innerHTML = '<div class="col"><p class="text-muted">No suppliers yet.</p></div>'; return; }
    container.innerHTML = suppliers.map(s => `
  <div class="col-md-4">
    <div class="card h-100">
      <div class="card-body">
        <div class="d-flex align-items-start justify-content-between mb-2">
          <h6 class="fw-bold mb-0">${s.supplier_name}</h6>
          ${roleIs('admin', 'research') ? `<button class="btn btn-sm btn-outline-primary" onclick="openEditSupplier(${s.supplier_id})"><i class="bi bi-pencil"></i></button>` : ''}
        </div>
        <div class="small text-muted mb-1"><i class="bi bi-person me-1"></i>${s.contact_info || '—'}</div>
        <div class="small text-muted mb-1"><i class="bi bi-geo-alt me-1"></i>${s.supplier_address || '—'}</div>
        <div class="small text-muted mb-2"><i class="bi bi-telephone me-1"></i>${s.supplier_phone_number || '—'}</div>
        <span class="badge bg-primary bg-opacity-10 text-primary">${s.ferret_count || 0} ferret(s)</span>
      </div>
    </div>
  </div>`).join('');
  } catch (err) { console.error(err); }
}

function openSupplierModal() {
  _editSupplierId = null;
  document.getElementById('supplierModalTitle').textContent = 'Add Supplier';
  document.getElementById('supId').value = '';
  document.getElementById('supName').value = '';
  document.getElementById('supContact').value = '';
  document.getElementById('supAddr').value = '';
  document.getElementById('supPhone').value = '';
  new bootstrap.Modal(document.getElementById('supplierModal')).show();
}

async function openEditSupplier(id) {
  _editSupplierId = id;
  try {
    const suppliers = await api('/suppliers');
    const s = suppliers.find(x => x.supplier_id === id);
    if (!s) return;
    document.getElementById('supplierModalTitle').textContent = `Edit: ${s.supplier_name}`;
    document.getElementById('supId').value = id;
    document.getElementById('supName').value = s.supplier_name || '';
    document.getElementById('supContact').value = s.contact_info || '';
    document.getElementById('supAddr').value = s.supplier_address || '';
    document.getElementById('supPhone').value = s.supplier_phone_number || '';
    new bootstrap.Modal(document.getElementById('supplierModal')).show();
  } catch (err) { alert(err.message); }
}

async function submitSupplier() {
  const name = document.getElementById('supName').value.trim();
  if (!name) return alert('Supplier name is required');
  const body = {
    supplier_name: name,
    contact_info: document.getElementById('supContact').value || null,
    supplier_address: document.getElementById('supAddr').value || null,
    supplier_phone_number: document.getElementById('supPhone').value || null
  };
  try {
    if (_editSupplierId) {
      await api(`/suppliers/${_editSupplierId}`, { method: 'PUT', body });
    } else {
      await api('/suppliers', { method: 'POST', body });
    }
    bootstrap.Modal.getInstance(document.getElementById('supplierModal')).hide();
    loadSuppliers();
  } catch (err) { alert(err.message); }
}

// ─── Users ────────────────────────────────────────────────────────────────────
async function loadUsers() {
  try {
    const data = await api('/users');
    const roleColors = { admin: 'danger', research: 'primary', maternity: 'success', caretaker: 'secondary', cleaner: 'warning' };
    document.getElementById('userTable').innerHTML = data.map(u => `
  <tr>
    <td><strong>${u.username}</strong></td>
    <td>${u.full_name || '—'}</td>
    <td>${u.email}</td>
    <td><span class="badge bg-${roleColors[u.role]} role-badge">${typeof roleLabel === 'function' ? roleLabel(u.role) : u.role}</span></td>
    <td>${u.active
        ? '<span class="badge bg-success-subtle text-success border border-success-subtle">Active</span>'
        : '<span class="badge bg-secondary-subtle text-secondary border">Inactive</span>'}</td>
    <td class="text-muted small">${u.last_login ? fmtDT(u.last_login) : 'Never'}</td>
    <td><button class="btn btn-sm btn-outline-primary" onclick="openEditUser(${u.user_id})"><i class="bi bi-pencil"></i></button></td>
  </tr>`).join('');
  } catch (err) { console.error(err); }
}

function openUserModal() {
  _editUserId = null;
  document.getElementById('userModalTitle').textContent = 'Add User';
  document.getElementById('uUsername').value = '';
  document.getElementById('uUsername').disabled = false;
  document.getElementById('uFullName').value = '';
  document.getElementById('uEmail').value = '';
  document.getElementById('uRole').value = 'caretaker';
  document.getElementById('uPassword').value = '';
  document.getElementById('uPassword').placeholder = 'Required — min 8 characters';
  document.getElementById('uPassReq').style.display = '';
  document.getElementById('uActiveWrap').style.display = 'none';
  new bootstrap.Modal(document.getElementById('userModal')).show();
}

async function openEditUser(id) {
  _editUserId = id;
  try {
    const users = await api('/users');
    const u = users.find(x => x.user_id === id);
    if (!u) return;
    document.getElementById('userModalTitle').textContent = `Edit: ${u.username}`;
    document.getElementById('uUsername').value = u.username;
    document.getElementById('uUsername').disabled = true;
    document.getElementById('uFullName').value = u.full_name || '';
    document.getElementById('uEmail').value = u.email;
    document.getElementById('uRole').value = u.role;
    document.getElementById('uPassword').value = '';
    document.getElementById('uPassword').placeholder = 'Leave blank to keep current';
    document.getElementById('uPassReq').style.display = 'none';
    document.getElementById('uActive').value = u.active ? '1' : '0';
    document.getElementById('uActiveWrap').style.display = '';
    new bootstrap.Modal(document.getElementById('userModal')).show();
  } catch (err) { alert(err.message); }
}

async function submitUser() {
  const body = {
    email: document.getElementById('uEmail').value,
    role: document.getElementById('uRole').value,
    full_name: document.getElementById('uFullName').value
  };
  const pw = document.getElementById('uPassword').value;
  if (pw) body.password = pw;
  try {
    if (_editUserId) {
      body.active = parseInt(document.getElementById('uActive').value);
      await api(`/users/${_editUserId}`, { method: 'PUT', body });
    } else {
      if (!pw) return alert('Password is required for new users');
      body.username = document.getElementById('uUsername').value;
      await api('/users', { method: 'POST', body });
    }
    document.getElementById('uUsername').disabled = false;
    bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
    loadUsers();
  } catch (err) { alert(err.message); }
}

// ─── Activity Log ─────────────────────────────────────────────────────────────
let _actPage = 1, _actUserId = null, _actDateFrom = null, _actDateTo = null;

async function loadActivity() {
  const filterEl = document.getElementById('actUserFilter');
  if (filterEl && filterEl.options.length === 1) {
    try {
      const users = await api('/users');
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.user_id;
        opt.textContent = u.full_name || u.username;
        filterEl.appendChild(opt);
      });
    } catch { /* non-fatal */ }
  }
  await fetchActPage(1);
}

async function fetchActPage(page) {
  _actPage = page;
  const params = new URLSearchParams({ page });
  if (_actUserId) params.set('user_id', _actUserId);
  if (_actDateFrom) params.set('date_from', _actDateFrom);
  if (_actDateTo) params.set('date_to', _actDateTo);

  const tbody = document.getElementById('actTable');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Loading\u2026</td></tr>';

  try {
    const { rows, total, pages } = await api('/activity-log?' + params.toString());
    const actionColors = {
      CREATE: 'success', UPDATE: 'primary', DELETE: 'danger', MOVE: 'info',
      LOGIN: 'secondary', COMPLETE: 'success', PHOTO_UPLOAD: 'secondary',
      PRINT: 'secondary', BUG_REPORT: 'warning', VET_COMM: 'info',
      EXAM_NOTE: 'info',
      PROCEDURE: 'warning', CREATE_USER: 'success', UPDATE_USER: 'primary',
      CREATE_LOCATION: 'info', DELETE_LOCATION: 'danger'
    };
    tbody.innerHTML = rows.map(a =>
      `<tr>
        <td class="text-muted small">${fmtDT(a.created_at)}</td>
        <td><strong>${a.full_name || a.username}</strong>${a.full_name && a.username && a.full_name !== a.username ? ` <span class="text-muted small">(${a.username})</span>` : ''}</td>
        <td><span class="badge bg-${actionColors[a.action] || 'secondary'} action-type">${a.action}</span></td>
        <td class="text-muted small">${a.table_name || '\u2014'}</td>
        <td class="small">${a.details || '\u2014'}</td>
      </tr>`
    ).join('') || '<tr><td colspan="5" class="text-muted text-center py-4">No activity found</td></tr>';

    const badge = document.getElementById('actTotalBadge');
    if (badge) badge.textContent = total + ' record' + (total !== 1 ? 's' : '');

    const pageInfo = document.getElementById('actPageInfo');
    const pageBtns = document.getElementById('actPageBtns');
    const pagingBar = document.getElementById('actPagination');
    const start = (page - 1) * 100 + 1;
    const end = Math.min(page * 100, total);
    if (pageInfo) pageInfo.textContent = total ? `Showing ${start}\u2013${end} of ${total}` : '';
    if (pagingBar) pagingBar.style.display = total > 100 ? '' : 'none';

    if (pageBtns) {
      const btn = (label, pg, active = false, disabled = false) =>
        `<button class="btn btn-sm ${active ? 'btn-primary' : 'btn-outline-secondary'}"
          ${disabled ? 'disabled' : ''} onclick="fetchActPage(${pg})">${label}</button>`;
      const range = 3;
      const lo = Math.max(1, page - range);
      const hi = Math.min(pages, page + range);
      let html = btn('\u2039', page - 1, false, page === 1);
      if (lo > 1) html += btn('1', 1) + (lo > 2 ? '<span class="px-1 text-muted">\u2026</span>' : '');
      for (let p = lo; p <= hi; p++) html += btn(p, p, p === page);
      if (hi < pages) html += (hi < pages - 1 ? '<span class="px-1 text-muted">\u2026</span>' : '') + btn(pages, pages);
      html += btn('\u203a', page + 1, false, page === pages);
      pageBtns.innerHTML = html;
    }
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="5" class="text-danger text-center py-3">Failed to load activity</td></tr>';
  }
}

function applyActFilters() {
  _actUserId = document.getElementById('actUserFilter').value || null;
  _actDateFrom = document.getElementById('actDateFrom').value || null;
  _actDateTo = document.getElementById('actDateTo').value || null;
  fetchActPage(1);
}

function clearActFilters() {
  document.getElementById('actUserFilter').value = '';
  document.getElementById('actDateFrom').value = '';
  document.getElementById('actDateTo').value = '';
  _actUserId = _actDateFrom = _actDateTo = null;
  fetchActPage(1);
}

// ─── Distribution Page ────────────────────────────────────────────────────────
let _distFilterId = null;
let _editDistributorId = null;

async function loadDistribution() {
  const canManage = roleIs('admin', 'research');
  if (canManage) document.getElementById('btnAddDistributor').classList.remove('d-none');
  else document.getElementById('btnAddDistributor').classList.add('d-none');

  try {
    const [distributors, events] = await Promise.all([
      api('/distributors'),
      api('/distribution-events')
    ]);

    const filterWrap = document.getElementById('distFilterBtns');
    filterWrap.innerHTML = `
      <button class="btn btn-sm ${_distFilterId === null ? 'btn-primary' : 'btn-outline-secondary'}" onclick="setDistFilter(null)">All</button>
      ${distributors.map(d => `
        <button class="btn btn-sm ${_distFilterId === d.distributor_id ? 'btn-primary' : 'btn-outline-secondary'}"
          onclick="setDistFilter(${d.distributor_id})">${d.distributor_name}</button>`).join('')}`;

    const cardsWrap = document.getElementById('distSummaryCards');
    cardsWrap.innerHTML = distributors.map(d => {
      const ferretCount = d.distribution_count || 0;
      const totalVal = d.total_value ? '$' + parseFloat(d.total_value).toFixed(2) : '—';
      const lastDate = d.last_distribution_date ? fmtDate(d.last_distribution_date) : 'Never';
      return `
        <div class="col-md-4 col-lg-3">
          <div class="card h-100">
            <div class="card-body">
              <div class="d-flex align-items-start justify-content-between mb-2">
                <div>
                  <h6 class="fw-bold mb-0">${d.distributor_name}</h6>
                  ${d.address ? `<div class="text-muted small"><i class="bi bi-geo-alt me-1"></i>${d.address}</div>` : ''}
                  ${d.contact_info ? `<div class="text-muted small"><i class="bi bi-person me-1"></i>${d.contact_info}</div>` : ''}
                  ${d.phone ? `<div class="text-muted small"><i class="bi bi-telephone me-1"></i>${d.phone}</div>` : ''}
                </div>
                ${canManage ? `
                <div class="d-flex flex-column gap-1">
                  <button class="btn btn-sm btn-outline-primary" onclick="openEditDistributor(${d.distributor_id})"><i class="bi bi-pencil"></i></button>
                  ${roleIs('admin', 'research') ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteDistributor(${d.distributor_id})"><i class="bi bi-trash"></i></button>` : ''}
                </div>` : ''}
              </div>
              <div class="d-flex gap-2 flex-wrap mt-2">
                <span class="badge bg-primary bg-opacity-10 text-primary">${ferretCount} ferret(s)</span>
                <span class="badge bg-success bg-opacity-10 text-success">${totalVal}</span>
                <span class="badge bg-secondary bg-opacity-10 text-secondary small">Last: ${lastDate}</span>
              </div>
              <button class="btn btn-sm btn-outline-secondary w-100 mt-2" onclick="setDistFilter(${d.distributor_id})">
                <i class="bi bi-list me-1"></i>View Records
              </button>
            </div>
          </div>
        </div>`;
    }).join('') || '<div class="col"><p class="text-muted">No distributors yet.</p></div>';

    renderDistTable(events);
  } catch (err) { console.error(err); }
}

function setDistFilter(id) {
  _distFilterId = id;
  document.querySelectorAll('#distFilterBtns button').forEach((btn, i) => {
    const isAll = (id === null && i === 0);
    btn.className = `btn btn-sm ${(isAll || btn.onclick?.toString().includes(`(${id})`)) ? 'btn-primary' : 'btn-outline-secondary'}`;
  });
  api('/distribution-events' + (id ? `?distributor_id=${id}` : ''))
    .then(events => renderDistTable(events))
    .catch(console.error);
}

function renderDistTable(events) {
  const tbody = document.getElementById('distTable');
  const titleEl = document.getElementById('distTableTitle');
  const countEl = document.getElementById('distTableCount');
  titleEl.textContent = _distFilterId ? 'Records for Selected Distributor' : 'All Distribution Records';
  countEl.textContent = events.length;
  if (!events.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-muted text-center py-4">No distribution records found.</td></tr>';
    return;
  }
  tbody.innerHTML = events.map(e => `
    <tr style="cursor:pointer" onclick="loadFerretDetail(${e.ferret_id})">
      <td>${fmtDate(e.distribution_date)}</td>
      <td><strong>${e.ferret_name}</strong></td>
      <td class="text-muted">${e.animal_id || '—'}</td>
      <td>${e.sex ? e.sex.charAt(0).toUpperCase() + e.sex.slice(1) : '—'}</td>
      <td>${e.distributor_name}</td>
      <td>${e.price != null ? '$' + parseFloat(e.price).toFixed(2) : '—'}</td>
      <td class="small text-muted">${e.dist_notes || '—'}</td>
      <td class="text-muted small">${e.recorded_by || '—'}</td>
      <td><i class="bi bi-chevron-right text-muted"></i></td>
    </tr>`).join('');
}

// ─── Distributor CRUD ─────────────────────────────────────────────────────────
function openDistributorModal() {
  _editDistributorId = null;
  document.getElementById('distributorModalTitle').textContent = 'Add Distributor';
  document.getElementById('distMgrId').value = '';
  document.getElementById('distMgrName').value = '';
  document.getElementById('distMgrContact').value = '';
  document.getElementById('distMgrAddr').value = '';
  document.getElementById('distMgrPhone').value = '';
  document.getElementById('distMgrNotes').value = '';
  new bootstrap.Modal(document.getElementById('distributorModal')).show();
}

async function openEditDistributor(id) {
  _editDistributorId = id;
  try {
    const distributors = await api('/distributors');
    const d = distributors.find(x => x.distributor_id === id);
    if (!d) return;
    document.getElementById('distributorModalTitle').textContent = `Edit: ${d.distributor_name}`;
    document.getElementById('distMgrId').value = id;
    document.getElementById('distMgrName').value = d.distributor_name || '';
    document.getElementById('distMgrContact').value = d.contact_info || '';
    document.getElementById('distMgrAddr').value = d.address || '';
    document.getElementById('distMgrPhone').value = d.phone || '';
    document.getElementById('distMgrNotes').value = d.notes || '';
    new bootstrap.Modal(document.getElementById('distributorModal')).show();
  } catch (err) { alert(err.message); }
}

async function submitDistributor() {
  const name = document.getElementById('distMgrName').value.trim();
  if (!name) return alert('Distributor name is required.');
  const body = {
    distributor_name: name,
    contact_info: document.getElementById('distMgrContact').value || null,
    address: document.getElementById('distMgrAddr').value || null,
    phone: document.getElementById('distMgrPhone').value || null,
    notes: document.getElementById('distMgrNotes').value || null
  };
  try {
    if (_editDistributorId) {
      await api(`/distributors/${_editDistributorId}`, { method: 'PUT', body });
    } else {
      await api('/distributors', { method: 'POST', body });
    }
    bootstrap.Modal.getInstance(document.getElementById('distributorModal')).hide();
    loadDistribution();
  } catch (err) { alert(err.message); }
}

async function deleteDistributor(id) {
  if (!confirm('Delete this distributor? This will fail if any distribution records reference it.')) return;
  try {
    await api(`/distributors/${id}`, { method: 'DELETE' });
    loadDistribution();
  } catch (err) { alert(err.message); }
}

// ─── Bug / change reports (v2.1-beta.11) ─────────────────────────────────────
const BUG_CAT_LABEL = {
  bug: 'Bug',
  data: 'Data correction',
  change: 'Change request',
  other: 'Other'
};
const BUG_STATUS_LABEL = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wont_fix: "Won't fix"
};
const BUG_STATUS_COLOR = {
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
  wont_fix: 'secondary'
};

function brEsc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function currentBugPage() {
  try { return sessionStorage.getItem('sb_page') || 'dashboard'; } catch (_) { return 'dashboard'; }
}

function openBugReportModal() {
  const title = document.getElementById('bugTitle');
  const desc = document.getElementById('bugDescription');
  const cat = document.getElementById('bugCategory');
  const err = document.getElementById('bugReportErr');
  if (title) title.value = '';
  if (desc) desc.value = '';
  if (cat) cat.value = 'bug';
  if (err) { err.classList.add('d-none'); err.textContent = ''; }
  const wrap = document.getElementById('bugRelatedFerretWrap');
  const box = document.getElementById('bugIncludeFerret');
  const label = document.getElementById('bugIncludeFerretLabel');
  const fid = typeof _currentFerretId !== 'undefined' ? _currentFerretId : null;
  if (wrap && box) {
    if (fid) {
      wrap.classList.remove('d-none');
      box.checked = true;
      if (label) label.textContent = 'This is about the ferret I am viewing';
    } else {
      wrap.classList.add('d-none');
      box.checked = false;
    }
  }
  new bootstrap.Modal(document.getElementById('bugReportModal')).show();
}

async function submitBugReport() {
  const err = document.getElementById('bugReportErr');
  const title = (document.getElementById('bugTitle')?.value || '').trim();
  const description = (document.getElementById('bugDescription')?.value || '').trim();
  const category = document.getElementById('bugCategory')?.value || 'bug';
  if (err) { err.classList.add('d-none'); err.textContent = ''; }
  if (!title) {
    if (err) { err.textContent = 'A short title is required.'; err.classList.remove('d-none'); }
    return;
  }
  if (!description) {
    if (err) { err.textContent = 'Describe what needs to change.'; err.classList.remove('d-none'); }
    return;
  }
  const includeFerret = document.getElementById('bugIncludeFerret')?.checked;
  const fid = includeFerret && typeof _currentFerretId !== 'undefined' ? _currentFerretId : null;
  try {
    await api('/bug-reports', {
      method: 'POST',
      body: {
        category,
        title,
        description,
        page: currentBugPage(),
        ferret_id: fid || undefined,
        diagnostic: {
          page: currentBugPage(),
          viewport: window.innerWidth + 'x' + window.innerHeight
        }
      }
    });
    const inst = bootstrap.Modal.getInstance(document.getElementById('bugReportModal'));
    if (inst) inst.hide();
    if (roleIs('admin')) refreshBugReportBadge();
    alert('Report sent to the admin.');
  } catch (e) {
    if (err) { err.textContent = e.message; err.classList.remove('d-none'); }
    else alert(e.message);
  }
}

async function refreshBugReportBadge() {
  if (!roleIs('admin')) return;
  const badge = document.getElementById('bugOpenBadge');
  if (!badge) return;
  try {
    const { open_count } = await api('/bug-reports/open-count');
    const n = Number(open_count) || 0;
    badge.textContent = String(n);
    badge.style.display = n ? '' : 'none';
  } catch (_) {
    badge.style.display = 'none';
  }
}

let _bugReportsCache = [];
let _openBugReportId = null;

async function loadBugReports() {
  if (!roleIs('admin')) return;
  const list = document.getElementById('bugReportList');
  if (!list) return;
  list.innerHTML = '<div class="text-muted p-3">Loading\u2026</div>';
  const statusSel = document.getElementById('bugStatusFilter')?.value || 'active';
  const category = document.getElementById('bugCategoryFilter')?.value || '';
  const params = new URLSearchParams();
  if (statusSel && statusSel !== 'all') params.set('status', statusSel);
  if (category) params.set('category', category);
  try {
    const raw = await api('/bug-reports' + (params.toString() ? '?' + params.toString() : ''));
    let rows = Array.isArray(raw) ? raw : (raw.rows || []);
    if (statusSel === 'active') rows = rows.filter(r => r.status === 'open' || r.status === 'in_progress');
    _bugReportsCache = rows;
    const totalBadge = document.getElementById('bugTotalBadge');
    if (totalBadge) totalBadge.textContent = rows.length + ' report' + (rows.length !== 1 ? 's' : '');
    refreshBugReportBadge();
    if (!rows.length) {
      list.innerHTML = '<div class="card"><div class="card-body text-muted">No reports match these filters.</div></div>';
      return;
    }
    list.innerHTML = '<div class="card"><div class="table-responsive"><table class="table table-sm table-hover mb-0">' +
      '<thead><tr><th>When</th><th>From</th><th>Category</th><th>Title</th><th>About</th><th>Status</th></tr></thead><tbody>' +
      rows.map(r =>
        '<tr style="cursor:pointer" onclick="openBugReportDetail(' + r.report_id + ')">' +
        '<td class="text-muted small">' + fmtDT(r.created_at) + '</td>' +
        '<td><strong>' + brEsc(r.full_name || r.username) + '</strong>' +
        '<div class="text-muted small">' + brEsc(roleLabel(r.reporter_role || '')) + '</div></td>' +
        '<td><span class="badge bg-secondary">' + brEsc(BUG_CAT_LABEL[r.category] || r.category) + '</span></td>' +
        '<td>' + brEsc(r.title) + '</td>' +
        '<td class="small">' + (r.ferret_name ? brEsc(r.ferret_name) : '<span class="text-muted">\u2014</span>') +
        (r.page ? '<div class="text-muted">' + brEsc(r.page) + '</div>' : '') + '</td>' +
        '<td><span class="badge bg-' + (BUG_STATUS_COLOR[r.status] || 'secondary') + '">' +
        brEsc(BUG_STATUS_LABEL[r.status] || r.status) + '</span></td></tr>'
      ).join('') +
      '</tbody></table></div></div>';
  } catch (err) {
    list.innerHTML = '<div class="alert alert-danger">' + brEsc(err.message) + '</div>';
  }
}

async function openBugReportDetail(id) {
  let r = _bugReportsCache.find(x => Number(x.report_id) === Number(id));
  if (!r) {
    try { r = await api('/bug-reports/' + id); } catch (err) { return alert(err.message); }
  }
  if (!r) return;
  _openBugReportId = r.report_id;
  document.getElementById('bugDetailTitle').textContent = r.title;
  document.getElementById('bugDetailStatus').value = r.status;
  const diag = r.diagnostic || {};
  const diagLines = [
    ['Page', r.page || diag.page],
    ['Ferret', r.ferret_name ? (r.ferret_name + (r.ferret_id ? ' (#' + r.ferret_id + ')' : '')) : (r.ferret_id ? '#' + r.ferret_id : null)],
    ['App version', r.app_version || diag.app_version],
    ['Viewport', diag.viewport],
    ['Browser', r.user_agent || diag.user_agent]
  ].filter(pair => pair[1]);
  document.getElementById('bugDetailBody').innerHTML =
    '<div class="d-flex flex-wrap gap-2 mb-3">' +
    '<span class="badge bg-' + (BUG_STATUS_COLOR[r.status] || 'secondary') + '">' + brEsc(BUG_STATUS_LABEL[r.status] || r.status) + '</span>' +
    '<span class="badge bg-secondary">' + brEsc(BUG_CAT_LABEL[r.category] || r.category) + '</span>' +
    '<span class="text-muted small">' + fmtDT(r.created_at) + ' · ' + brEsc(r.full_name || r.username) +
    ' (' + brEsc(roleLabel(r.reporter_role || '')) + ')</span></div>' +
    '<p style="white-space:pre-wrap">' + brEsc(r.description) + '</p>' +
    '<div class="card bg-light mb-3"><div class="card-body py-2 small">' +
    '<div class="fw-semibold mb-1">Data report</div>' +
    (diagLines.map(pair => '<div><span class="text-muted">' + brEsc(pair[0]) + ':</span> ' + brEsc(pair[1]) + '</div>').join('') ||
      '<div class="text-muted">No extra context</div>') +
    '</div></div>' +
    '<label class="form-label fw-semibold">Admin notes</label>' +
    '<textarea id="bugAdminNotes" class="form-control" rows="3">' + brEsc(r.admin_notes || '') + '</textarea>' +
    (r.resolved_at
      ? '<div class="text-muted small mt-2">Closed ' + fmtDT(r.resolved_at) +
        (r.resolved_by_name || r.resolved_by_username ? ' by ' + brEsc(r.resolved_by_name || r.resolved_by_username) : '') + '</div>'
      : '');
  new bootstrap.Modal(document.getElementById('bugReportDetailModal')).show();
}

async function saveBugReportStatus() {
  if (!_openBugReportId) return;
  const status = document.getElementById('bugDetailStatus')?.value;
  const admin_notes = document.getElementById('bugAdminNotes')?.value || '';
  try {
    await api('/bug-reports/' + _openBugReportId, { method: 'PUT', body: { status, admin_notes } });
    const inst = bootstrap.Modal.getInstance(document.getElementById('bugReportDetailModal'));
    if (inst) inst.hide();
    loadBugReports();
  } catch (err) { alert(err.message); }
}