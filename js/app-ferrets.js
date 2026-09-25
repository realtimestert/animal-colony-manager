// SanusBio v2.2-beta.4 | 2026-09-17 | app-ferrets.js
// v2.2-beta.4: Ferret card Medical Info tab now holds Health Events,
//          Vaccinations, Medical Info, and the veterinarian communication log.
// v2.1-beta.11: Medical "Current Status" / print Vital Status show Distributed
//          when distributed=1 AND not in research. On-site research stays Alive
//          until Mark Deceased. Death still wins. List tabs unchanged
//          (Research still wins when both flags are set).
//          Only admin can rename a ferret (canEditName). Research still
//          edits birth date / sex / color / description.
// v2.1-beta.10: Print button on the individual ferret record. printFerretCard()
//          opens a same-origin window with every tab expanded (profile, RFID,
//          lighting, health + weight graph when 2+ weigh-ins exist, vaccinations,
//          mating, litters, medical/death log, estrus, distribution,
//          location/light history, activity, research).
//          Weight-over-time SVG prints under Health Events when 2+ weight rows exist.
// v2.1-beta.9: Lighting follows the ferret. Room toggle removed. Light Cycle
//          card is this animal's schedule only; caretaker can edit it.
//          Move button is canWrite() so the keep/change prompt is available
//          to every role except cleaner.
// v2.1-beta.8: History tab shows full name of who made the change; details
//          (ferret name + room label) are resolved server-side.
// v2.1-beta.7: RFID unassign is admin/research only; edit partner on mated events;
//          kit deaths shown separately from stillborns.
// v2.1-beta.6: Structured death log — required cause, food/water + cage mates,
//          necropsy notes after the fact, multiple death/necropsy photos
// v2.1-beta.3: Auto AID on create; archive-then-purge delete; Archived tab
// v2.1-beta.2: Pending distribution tags (offsite / research)
// v2.1-beta.1: Research tab + assign/end research + studies page
// SanusBio v2.1-beta.0 | 2026-08-20 | app-ferrets.js
// v2.0-beta.6: Add Ferret form + detail page support color (create + edit)
// v2.0-beta.5: (1) original photo download uses authenticated blob fetch (fixes 401);
//          (2) detail age shows "At distribution" for distributed ferrets;
//          (3) Light Cycle weeks freeze at death/distribution date;
//          (4) admin/research can edit description on ferret detail page
// v2.0-beta.4: Light History trailing period follows manual light_cycle when set
//          (server-side) so the tab matches the live Light Cycle card
// v2.0-beta.3: Light History duration = weeks with one decimal only (no days)
// v2.0-beta.2: Light History notes — continuous periods; non-physical/HIST-only
//          rooms (e.g. bad import room 15) inherit prior schedule state
// v2.0-beta.1: Light History tab on ferret detail — continuous schedule periods
//          from location history + room_light_history (GET /api/ferrets/:id/light-history)
// SanusBio v1.10.5 | 2026-08-13 | app-ferrets.js
// Ferrets grid/detail, RFID, Distribution, Photo, Ferret Actions, Add Ferret Modal
// v1.10.5: ferret name is now editable on the ferret detail page for
//          admin/research (canEdit), matching the existing Birth Date / Sex
//          inline-edit pattern — saveFerretName() PUTs ferret_name (already
//          accepted server-side) and reloads the detail view
// v1.10.4: ferretAge() now returns weeks with one decimal place (was whole
//          weeks only) — affects every age display across the app
// v1.9.4: ages always shown in weeks (no Y/mo breakdown); Age at Death added next to Date of Death
// v1.9.5: light cycle moved to per-ferret tracking (auto/manual), duration + edit controls on ferret detail
// v1.10.0: new Location History tab (every former room, via ferret_location_history);
//          Mating History + Estrus Status tabs show pulled-date + expected litter range
// v1.10.1: ferret-detail Litters tab uses litterCreatableCount() (excludes stillborn)
// v1.10.2: age in weeks now shown next to Animal ID on the ferret detail page
//          (reuses ferretAge(); shows "Lived Xwk" if deceased, current age otherwise)
// v1.10.3: (1) Health Events tab now has Edit/Delete buttons for admin/
//          research/maternity — health rows are cached in
//          window._currentHealthEvents so app-medical.js's edit modal can
//          look them up without stuffing notes text through onclick attrs;
//          (2) new "Litters (as Father)" tab for males, showing every litter
//          where this ferret is recorded as father plus kit/surviving totals

// ─── Ferrets ──────────────────────────────────────────────────────────────────
async function loadFerrets(search = '') {
  if (canUpdate()) document.getElementById('btnAddFerret').classList.remove('d-none');
  if (roleIs('admin')) {
    document.getElementById('btnAddLocation').classList.remove('d-none');
    document.getElementById('btnAddSupplier').classList.remove('d-none');
  }
  try {
    const qs = new URLSearchParams({ include_archived: '1' });
    if (search) qs.set('search', search);
    _ferretData = await api('/ferrets?' + qs.toString());
    renderFerretGrid();
  } catch (err) { console.error(err); }
}

let _ferretTab = 'active';

function switchFerretTab(tab) {
  _ferretTab = tab;
  document.getElementById('tabActive').classList.toggle('active', tab === 'active');
  document.getElementById('tabDeceased').classList.toggle('active', tab === 'deceased');
  document.getElementById('tabDistributed').classList.toggle('active', tab === 'distributed');
  document.getElementById('tabResearch')?.classList.toggle('active', tab === 'research');
  document.getElementById('tabPending')?.classList.toggle('active', tab === 'pending');
  document.getElementById('tabArchived')?.classList.toggle('active', tab === 'archived');
  renderFerretGrid();
}

function ferretAge(birthDate, endDate) {
  if (!birthDate) return '—';
  const birth = new Date(birthDate);
  const end = endDate ? new Date(endDate) : new Date();
  const totalDays = Math.floor((end - birth) / 864e5);
  if (totalDays < 0) return '—';
  const totalWeeks = (totalDays / 7).toFixed(1);
  return totalWeeks + 'wk';
}

async function downloadOriginalPhoto(id) {
  try {
    const res = await fetch(`/api/ferrets/${id}/photo/original`, {
      headers: { 'Authorization': 'Bearer ' + TOKEN }
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const e = await res.json(); if (e.error) msg = e.error; } catch (_) {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i);
    const filename = m ? decodeURIComponent(m[1].replace(/['"]/g, '')) : `ferret_${id}_original.jpg`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    alert('Could not download original photo: ' + err.message);
  }
}


function renderFerretGrid() {
  const grid = document.getElementById('ferretGrid');
  if (!_ferretData.length) { grid.innerHTML = '<div class="col"><p class="text-muted mt-2">No ferrets found.</p></div>'; return; }

  const isArchived = f => f.archived == 1;
  const isResearch = f => !isArchived(f) && f.dead !== '1' && f.in_research == 1;
  const isDistributed = f => !isArchived(f) && f.distributed == 1 && !isResearch(f);
  const isPending = f => !isArchived(f) && !isDistributed(f) && f.dead !== '1' && !isResearch(f) && !!f.distribution_tag;
  const isDeceased = f => !isArchived(f) && !isDistributed(f) && f.dead === '1';
  const isActive = f => !isArchived(f) && !isDistributed(f) && f.dead !== '1' && !isResearch(f) && !isPending(f);

  let filtered;
  if (_ferretTab === 'distributed') filtered = _ferretData.filter(isDistributed);
  else if (_ferretTab === 'research') filtered = _ferretData.filter(isResearch);
  else if (_ferretTab === 'pending') filtered = _ferretData.filter(isPending);
  else if (_ferretTab === 'deceased') filtered = _ferretData.filter(isDeceased);
  else if (_ferretTab === 'archived') filtered = _ferretData.filter(isArchived);
  else filtered = _ferretData.filter(isActive);

  const tabAC = document.getElementById('tabActiveCount');
  const tabDC = document.getElementById('tabDeceasedCount');
  const tabDist = document.getElementById('tabDistributedCount');
  const tabRes = document.getElementById('tabResearchCount');
  const tabPend = document.getElementById('tabPendingCount');
  const tabArch = document.getElementById('tabArchivedCount');
  if (tabAC) tabAC.textContent = _ferretData.filter(isActive).length;
  if (tabDC) tabDC.textContent = _ferretData.filter(isDeceased).length || '';
  if (tabDist) tabDist.textContent = _ferretData.filter(isDistributed).length || '';
  if (tabRes) tabRes.textContent = _ferretData.filter(isResearch).length || '';
  if (tabPend) tabPend.textContent = _ferretData.filter(isPending).length || '';
  if (tabArch) tabArch.textContent = _ferretData.filter(isArchived).length || '';

  if (!filtered.length) {
    const msgs = { active: 'No active ferrets.', deceased: 'No deceased ferrets.', distributed: 'No distributed ferrets.', research: 'No ferrets on research.', pending: 'No ferrets tagged for distribution.', archived: 'No archived ferrets.' };
    grid.innerHTML = `<div class="col"><p class="text-muted mt-2">${msgs[_ferretTab]}</p></div>`;
    return;
  }

  const sortBy = document.getElementById('ferretSort')?.value || 'name';
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'age') return new Date(a.birth_date || 0) - new Date(b.birth_date || 0);
    if (sortBy === 'sex') return (a.sex || 'zzz').localeCompare(b.sex || 'zzz');
    if (sortBy === 'room') return (a.room_id || 0) - (b.room_id || 0);
    if (sortBy === 'supplier') return (a.supplier_name || 'zzz').localeCompare(b.supplier_name || 'zzz');
    return (a.name || '').localeCompare(b.name || '');
  });
  const sexIcon = s => s === 'male' ? '<span class="badge bg-primary badge-pill small">♂ M</span>'
    : s === 'female' ? '<span class="badge bg-danger badge-pill small">♀ F</span>' : '';
  grid.innerHTML = sorted.map(f => {
    const vaccDue = f.next_rabies_vaccine_due &&
      new Date(f.next_rabies_vaccine_due) <= new Date(Date.now() + 30 * 864e5) && !isDistributed(f) && f.dead !== '1';
    let ageLabel;
      if (isDeceased(f)) {
        ageLabel = 'Lived ' + ferretAge(f.birth_date, f.death_date);
      } else if (isDistributed(f)) {
        ageLabel = 'At distribution: ' + ferretAge(f.birth_date, f.distribution_date);
      } else {
        ageLabel = ferretAge(f.birth_date);
      }
    return `
  <div class="col-md-4 col-lg-3">
    <div class="card ferret-card" onclick="loadFerretDetail(${f.id})">
      ${f.photo_url
        ? `<img src="${f.photo_url}" class="ferret-avatar w-100" alt="">`
        : `<div class="ferret-placeholder">🐾</div>`}
      <div class="card-body p-2">
        <div class="d-flex align-items-start justify-content-between">
          <div>
            <h6 class="mb-0 fw-semibold">${f.name}</h6>
            <div class="text-muted small">${ageLabel}</div>
            ${isDeceased(f) && f.cause_of_death ? `<div class="text-muted small">Cause: ${f.cause_of_death}</div>` : ''}
          </div>
          <span class="status-dot mt-1 ${isDistributed(f) ? 'dot-dead' : f.dead === '1' ? 'dot-dead' : isResearch(f) ? 'dot-research' : isPending(f) ? 'dot-pending' : 'dot-active'}"
            style="${isDistributed(f) ? 'background:#7c3aed' : ''}"></span>
        </div>
        <div class="text-muted small mt-1">ID: ${fmtAid(f.animal_id)}</div>
        <div class="small">Room ${f.room_id || '?'} · Cage ${f.cage_address || '?'}${f.room_lighting ? ' · ' + f.room_lighting : ''}</div>
        <div class="mt-1 d-flex flex-wrap gap-1">
          ${sexIcon(f.sex)}
          ${isDistributed(f) ? `<span class="badge badge-pill small" style="background:#7c3aed;color:#fff">Distributed</span>` : ''}
          ${isResearch(f) ? `<span class="badge badge-pill small" style="background:#0d6efd;color:#fff">Research${f.research_cohort && f.research_cohort !== 'unassigned' ? ' · ' + f.research_cohort : ''}</span>` : ''}
          ${isPending(f) ? `<span class="badge badge-pill small" style="background:#6c757d;color:#fff">Pending ${f.distribution_tag === 'research' ? 'research' : 'offsite'}</span>` : ''}
          ${isArchived(f) ? `<span class="badge bg-dark badge-pill small">Archived</span>` : ''}
          ${f.dead === '1' && !isDistributed(f) && !isArchived(f) ? `<span class="badge bg-danger badge-pill small">Deceased${f.cause_of_death ? ' · ' + f.cause_of_death : ''}</span>` : ''}
          ${vaccDue ? `<span class="badge bg-warning text-dark badge-pill small">Vaccine Due</span>` : ''}
          ${f.eight_hour_light && !isDistributed(f) ? `<span class="badge bg-info text-dark badge-pill small">💡 8hr Light</span>` : ''}
          ${f.sex === 'female' && !isDistributed(f) && f.dead !== '1' && f.breeding_retired
        ? `<span class="badge bg-secondary badge-pill small">Retired (Breeding)</span>`
        : (f.sex === 'female' && f.female_status && f.female_status !== 'baseline' && !isDistributed(f) && f.dead !== '1' ? (
          f.female_status === 'estrus' ? `<span class="badge bg-danger badge-pill small">♥ Estrus</span>` :
            f.female_status === 'mated' ? `<span class="badge bg-warning text-dark badge-pill small">Mated</span>` :
              f.female_status === 'littered' ? `<span class="badge bg-success badge-pill small">Littered</span>` :
                f.female_status === 'weaned' ? `<span class="badge bg-info text-dark badge-pill small">Weaned</span>` : ''
        ) : '')}
        </div>
        ${!isDistributed(f) && f.dead !== '1' && !isArchived(f) ? `
        <div class="mt-2 small" onclick="event.stopPropagation()">
          <label class="me-2 mb-0"><input type="checkbox" class="form-check-input me-1" ${f.needs_bath == 1 ? 'checked' : ''} onchange="toggleCareNeed(${f.id},'bath',this.checked)">Needs bath</label>
          <label class="mb-0"><input type="checkbox" class="form-check-input me-1" ${f.needs_nail_trim == 1 ? 'checked' : ''} onchange="toggleCareNeed(${f.id},'nail',this.checked)">Needs nail trim</label>
        </div>` : ''}
        ${isDistributed(f) && f.distributor_name ? `<div class="text-muted small mt-1" style="font-size:.75rem">→ ${f.distributor_name}</div>` : ''}
        ${isResearch(f) && f.research_study_name ? `<div class="text-muted small mt-1" style="font-size:.75rem">🔬 ${f.research_study_name}</div>` : ''}
        ${isPending(f) && f.distribution_tag_dest ? `<div class="text-muted small mt-1" style="font-size:.75rem">🔖 ${f.distribution_tag_dest}</div>` : ''}
        ${f.color ? `<div class="text-muted small mt-1" style="font-size:.75rem">🎨 ${f.color}</div>` : ''}
        ${f.description ? `<div class="text-muted small mt-1" style="font-size:.75rem;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${f.description}</div>` : ''}
      </div>
    </div>
  </div>`;
  }).join('');
}

async function loadFerretDetail(id) {
  _currentFerretId = id;
  try {
    sessionStorage.setItem('sb_page', 'ferrets');
    sessionStorage.setItem('sb_ferret', String(id));
  } catch (_) {}
  document.querySelectorAll('.page').forEach(p => p.classList.remove('show'));
  document.querySelectorAll('#navLinks .nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById('page-ferret-detail').classList.add('show');
  const el = document.getElementById('ferretDetail');
  el.innerHTML = '<div class="text-center py-5 text-muted"><div class="spinner-border" role="status"></div></div>';
  try {
    const [f, health, vacc, litters, history, repro, examNotes, matings, fatherLitters, vetComms] = await Promise.all([
      api(`/ferrets/${id}`),
      api(`/ferrets/${id}/health`),
      api(`/ferrets/${id}/vaccinations`),
      api(`/ferrets/${id}/litters`),
      api(`/ferrets/${id}/history`),
      api(`/ferrets/${id}/reproductive`).catch(() => []),
      api(`/ferrets/${id}/exam-notes`).catch(() => []),
      api(`/ferrets/${id}/matings`).catch(() => []),
      api(`/ferrets/${id}/litters-as-father`).catch(() => []),
      api(`/ferrets/${id}/vet-communications`).catch(() => [])
    ]);
    const death = f.death || null;
    window._currentHealthEvents = health;
    const isAdmin = roleIs('admin', 'research');
    const isMat = roleIs('admin', 'maternity');
    const canEdit = roleIs('admin', 'research');
    const canEditName = roleIs('admin');
    el.innerHTML = `
  <div class="row g-3 mb-3">
    <div class="col-md-3">
      <div class="position-relative">
        ${f.photo_url
        ? `<img src="${f.photo_url}" class="img-fluid rounded-3 shadow-sm w-100" style="height:220px;object-fit:cover">`
        : `<div class="bg-light rounded-3 d-flex align-items-center justify-content-center" style="height:160px;font-size:3.5rem">🐾</div>`}
        ${canUpdate() ? `<button class="btn btn-sm btn-dark position-absolute bottom-0 end-0 m-2 opacity-75" onclick="openPhotoModal(${id})"><i class="bi bi-camera"></i></button>` : ''}
        ${f.photo_url ? `<button class="btn btn-sm btn-outline-light position-absolute bottom-0 start-0 m-2 opacity-75" onclick="event.stopPropagation(); downloadOriginalPhoto(${id})" title="Download original photo"><i class="bi bi-download"></i></button>` : ''}
      </div>
    </div>
    <div class="col-md-9">
      <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
        ${canEditName ? `
        <div class="d-flex align-items-center gap-2">
          <input type="text" id="editFerretName" class="form-control form-control-sm fw-bold"
            style="max-width:220px;font-size:1.15rem" maxlength="45" value="${f.ferret_name.replace(/"/g, '&quot;')}">
          <button class="btn btn-sm btn-outline-primary" onclick="saveFerretName(${id})" title="Save name">
            <i class="bi bi-check2"></i>
          </button>
        </div>` : `<h3 class="mb-0 fw-bold">${f.ferret_name}</h3>`}
        ${f.archived == 1 ? `<span class="badge bg-dark">Archived</span>` : f.in_research == 1 && f.dead !== '1' ? `<span class="badge" style="background:#0d6efd">Research</span>` : f.distributed == 1 ? `<span class="badge" style="background:#7c3aed">Distributed</span>` : f.distribution_tag ? `<span class="badge bg-secondary">Pending ${f.distribution_tag === 'research' ? 'research' : 'offsite'}</span>` : f.dead === '1' ? `<span class="badge bg-danger">Deceased</span>${(death && death.cause_of_death) || f.cause_of_death ? ` <span class="badge bg-danger-subtle text-danger border border-danger-subtle">${(death && death.cause_of_death) || f.cause_of_death}</span>` : ''}` : `<span class="badge bg-success">Active</span>`}
        <div class="ms-auto d-flex gap-2 flex-wrap">
          <button class="btn btn-sm btn-outline-secondary no-print" onclick="event.stopPropagation(); printFerretCard(${id})" title="Print complete record (all tabs)">
            <i class="bi bi-printer me-1"></i>Print
          </button>
          ${f.archived != 1 && canUpdate() && (!f.distributed || f.in_research == 1) ? (f.dead === '1'
        ? `<button class="btn btn-sm btn-outline-secondary" onclick="toggleDead(${id},'1')">Mark Active</button>`
        : `<button class="btn btn-sm btn-outline-danger" onclick="openDeceasedModal(${id})"><i class="bi bi-heartbreak me-1"></i>Mark Deceased</button>`
      ) : ''}
          ${f.archived != 1 && canUpdate() && f.dead !== '1' && !f.distributed && f.in_research != 1 && !f.distribution_tag ? `<button class="btn btn-sm btn-outline-secondary" onclick="openTagDistModal(${id}, '${f.ferret_name.replace(/'/g, "\\'")}')"><i class="bi bi-bookmark me-1"></i>Tag for Distribution</button>` : ''}
          ${f.archived != 1 && canUpdate() && f.distribution_tag && f.dead !== '1' && !f.distributed && f.in_research != 1 ? `<button class="btn btn-sm btn-outline-secondary" onclick="clearDistributionTag(${id})">Clear Tag</button>` : ''}
          ${f.archived != 1 && canUpdate() && f.dead !== '1' && !f.distributed && f.in_research != 1 ? `<button class="btn btn-sm btn-outline-primary" onclick="openDistributeModal(${id}, '${f.ferret_name.replace(/'/g, "\\'")}')"><i class="bi bi-box-arrow-right me-1"></i>Distribute</button>` : ''}
          ${f.archived != 1 && canUpdate() && f.dead !== '1' && !f.distributed && f.in_research != 1 ? `<button class="btn btn-sm btn-outline-info" onclick="openAssignResearchModal(${id}, '${f.ferret_name.replace(/'/g, "\\'")}')"><i class="bi bi-clipboard2-pulse me-1"></i>Assign to Research</button>` : ''}
          ${f.archived != 1 && canUpdate() && f.in_research == 1 && f.dead !== '1' ? `<button class="btn btn-sm btn-outline-info" onclick="openEndResearchModal(${id}, '${f.ferret_name.replace(/'/g, "\\'")}')"><i class="bi bi-box-arrow-left me-1"></i>End Research</button>` : ''}
          ${f.archived != 1 && canUpdate() && f.distributed && f.in_research != 1 ? `<button class="btn btn-sm btn-outline-secondary" onclick="undoDistribute(${id})">Undo Distribution</button>` : ''}
          ${f.archived == 1
        ? `${isAdmin ? `<button class="btn btn-sm btn-outline-secondary" onclick="restoreFerret(${id}, '${(f.ferret_name || '').replace(/'/g, "\\'")}')">Restore</button>` : ''}
           ${roleIs('admin') ? `<button class="btn btn-sm btn-danger" onclick="purgeFerret(${id}, '${(f.ferret_name || '').replace(/'/g, "\\'")}')">Permanently Delete</button>` : ''}`
        : `${isAdmin ? `<button class="btn btn-sm btn-outline-danger" onclick="archiveFerret(${id}, '${(f.ferret_name || '').replace(/'/g, "\\'")}')">Archive</button>` : ''}`}
        </div>
      </div>
      <div class="text-muted mb-2">Animal ID: ${fmtAid(f.animal_id)} &nbsp;·&nbsp; <strong>${f.in_research == 1 && f.dead !== '1' ? ferretAge(f.birth_date) : f.distributed == 1 ? 'At distribution: ' + ferretAge(f.birth_date, f.distribution_date) : f.dead === '1' ? 'Lived ' + ferretAge(f.birth_date, f.death_date) : ferretAge(f.birth_date)}</strong></div>
      ${f.archived == 1 ? `<div class="alert alert-dark py-2 small mb-2">In archive${f.archived_by ? ' · archived by ' + f.archived_by : ''}${f.archived_at ? ' on ' + String(f.archived_at).slice(0, 10) : ''}. An admin can restore or permanently delete after review.</div>` : ''}
      ${f.research ? `<div class="alert alert-info py-2 small mb-2">On research: <strong>${f.research.study_name}</strong>${f.research.sponsor ? ' · ' + f.research.sponsor : ''} · ${f.research.cohort || 'unassigned'} · since ${String(f.research.assigned_date).slice(0, 10)}</div>` : ''}
      ${f.distribution_tag && f.in_research != 1 && f.distributed != 1 ? `<div class="alert alert-secondary py-2 small mb-2">Tagged for <strong>${f.distribution_tag === 'research' ? 'on-site research' : 'offsite distribution'}</strong>${f.distribution_tag_dest ? ' → ' + f.distribution_tag_dest : ''}${f.distribution_tagged_at ? ' · since ' + String(f.distribution_tagged_at).slice(0, 10) : ''}${f.distribution_tag_notes ? ' — ' + f.distribution_tag_notes : ''}</div>` : ''}
      <div class="row g-2 small">
        <div class="col-6 col-md-4"><span class="text-muted">Birth Date</span><br>
          ${canEdit
        ? `<div class="d-flex align-items-center gap-2 mt-1">
                <input type="date" id="editBirthDate" class="form-control form-control-sm"
                  value="${f.birth_date ? String(f.birth_date).slice(0, 10) : ''}"
                  style="max-width:160px">
                <button class="btn btn-sm btn-outline-primary" onclick="saveBirthDate(${id})">
                  <i class="bi bi-check2"></i> Save
                </button>
               </div>`
        : `<strong>${fmtDate(f.birth_date)}</strong>`}
        </div>
        ${f.dead === '1' ? `
        <div class="col-6 col-md-4"><span class="text-muted">Death Date</span><br>
          ${canEdit
          ? `<div class="d-flex align-items-center gap-2 mt-1">
                <input type="date" id="editDeathDate" class="form-control form-control-sm"
                  value="${f.death_date ? String(f.death_date).slice(0, 10) : ''}"
                  style="max-width:160px">
                <button class="btn btn-sm btn-outline-primary" onclick="saveDeathDate(${id})">
                  <i class="bi bi-check2"></i> Save
                </button>
               </div>`
          : `<strong>${fmtDate(f.death_date)}</strong>`}
        </div>
        <div class="col-6 col-md-4"><span class="text-muted">Cause of Death</span><br>
          <strong>${(death && death.cause_of_death) || f.cause_of_death || '—'}</strong>
        </div>` : ''}
        <div class="col-6 col-md-4"><span class="text-muted">Sex</span><br>
          ${canEdit
        ? `<div class="d-flex align-items-center gap-2 mt-1">
              <select id="editSex" class="form-select form-select-sm" style="max-width:140px">
                <option value="" ${!f.sex ? 'selected' : ''}>— Unknown —</option>
                <option value="male" ${f.sex === 'male' ? 'selected' : ''}>Male</option>
                <option value="female" ${f.sex === 'female' ? 'selected' : ''}>Female</option>
              </select>
              <button class="btn btn-sm btn-outline-primary" onclick="saveSex(${id})">
                <i class="bi bi-check2"></i> Save
              </button>
            </div>`
        : `<strong>${f.sex ? f.sex.charAt(0).toUpperCase() + f.sex.slice(1) : '—'}</strong>`}
        </div>
        <div class="col-6 col-md-4"><span class="text-muted">Weight</span><br><strong>${f.weight ? f.weight + ' g' : '—'}</strong></div>
        <div class="col-6 col-md-4"><span class="text-muted">Location</span><br>
          <strong>Room ${f.room_id || '?'} · ${f.cage_address || '?'}${f.room_lighting ? ' · ' + f.room_lighting : ''}</strong>
          ${canWrite() && f.dead !== '1' && (!f.distributed || f.in_research == 1) ? `<button class="btn btn-link btn-sm p-0 ms-1" onclick="openMoveModal(${id})"><i class="bi bi-arrow-left-right"></i></button>` : ''}</div>
        <div class="col-6 col-md-4"><span class="text-muted">Supplier</span><br><strong>${f.supplier_name || '—'}</strong></div>
        <div class="col-6 col-md-4"><span class="text-muted">Mother</span><br><strong>${f.mother_name || '—'}</strong></div>
        <div class="col-6 col-md-4"><span class="text-muted">Father</span><br><strong>${f.father_name || '—'}</strong></div>
        <div class="col-6 col-md-4"><span class="text-muted">Next Rabies Vacc.</span><br><strong>${fmtDate(f.next_rabies_vaccine_due)}</strong></div>
        <div class="col-6 col-md-4"><span class="text-muted">Spayed/Castrated</span><br><strong>${f.castrated_or_spayed === 'y' ? 'Yes' : 'No'}</strong></div>
        <div class="col-6 col-md-4"><span class="text-muted">Last Exam</span><br><strong>${fmtDate(f.last_exam_date)}</strong></div>
        ${f.treatments ? `<div class="col-12"><span class="text-muted">Treatments</span><br><strong>${f.treatments}</strong></div>` : ''}
        ${f.orders ? `<div class="col-12"><span class="text-muted">Orders</span><br><strong>${f.orders}</strong></div>` : ''}
        <div class="col-6 col-md-4">
          <span class="text-muted">Color</span><br>
          ${canEdit
            ? `<div class="d-flex align-items-center gap-2 mt-1">
                <input type="text" id="editColor" class="form-control form-control-sm" style="max-width:180px"
                  value="${(f.color || '').replace(/"/g, '&quot;')}" placeholder="e.g. Color-Cinnamon">
                <button class="btn btn-sm btn-outline-primary" onclick="saveColor(${id})" title="Save color">
                  <i class="bi bi-check2"></i>
                </button>
              </div>`
            : `<strong>${f.color || '—'}</strong>`}
        </div>
        <div class="col-12">
          <span class="text-muted">Description</span>
          ${canEdit ? `
            <div class="mt-1">
              <textarea id="editDescription" class="form-control form-control-sm" rows="3" style="white-space:pre-wrap;line-height:1.5">${(f.description || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
              <button class="btn btn-sm btn-outline-primary mt-1" onclick="saveDescription(${id})">
                <i class="bi bi-check2 me-1"></i>Save Description
              </button>
            </div>
          ` : (f.description ? `<div class="mt-1 p-2 bg-light rounded small" style="white-space:pre-wrap;line-height:1.6">${f.description}</div>` : '<div class="text-muted small mt-1">—</div>')}
        </div>
      </div>
    </div>
  </div>

  <!-- RFID + Light Cycle + Mating Restrictions info row -->
  <div class="row g-3 mb-3" id="rfidLightRow">
    <div class="col-md-4">
      <div class="card p-3 h-100">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <span class="fw-semibold"><i class="bi bi-broadcast me-1 text-primary"></i>RFID Chip</span>
          ${canUpdate() ? `<button class="btn btn-sm btn-outline-primary" onclick="openRfidModal(${id})"><i class="bi bi-pencil me-1"></i>Assign</button>` : ''}
        </div>
        <div id="rfidDisplay">
          <div class="text-center text-muted py-2 small">
            <div class="spinner-border spinner-border-sm" role="status"></div> Loading…
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-4">
      <div class="card p-3 h-100">
        <div class="d-flex align-items-center justify-content-between mb-1">
          <span class="fw-semibold"><i class="bi bi-lightbulb me-1 text-warning"></i>Light Cycle (Summer / Winter)</span>
          <span class="badge ${f.eight_hour_light ? 'bg-warning text-dark' : 'bg-secondary'}">
            ${f.eight_hour_light ? '8-Hour (Winter)' : 'Standard (Summer)'}
          </span>
        </div>
        <div class="text-muted small">
          ${f.light_state_since ? (() => {
            const endCap = f.distributed == 1 ? f.distribution_date : (f.dead === '1' ? f.death_date : null);
            const wks = weeksSince(f.light_state_since, endCap);
            const frozen = endCap ? ` (stopped at ${fmtDate(endCap)})` : '';
            return `${wks}wk on this cycle (since ${fmtDate(f.light_state_since)})${frozen}`;
          })() : 'Duration unknown'}
        </div>
        <div class="text-muted small mb-2">Follows this ferret when it moves. Keeping the same schedule on a move does not reset the clock.</div>
        ${canChangeLighting() ? `
        <div id="lightCycleEditRow" class="d-flex flex-wrap gap-2 align-items-end mb-2" style="display:none">
          <div>
            <label class="form-label small mb-1">Cycle</label>
            <select id="lcManualValue" class="form-select form-select-sm">
              <option value="0" ${!f.eight_hour_light ? 'selected' : ''}>Standard (Summer)</option>
              <option value="1" ${f.eight_hour_light ? 'selected' : ''}>8-Hour (Winter)</option>
            </select>
          </div>
          <div>
            <label class="form-label small mb-1">Since</label>
            <input id="lcManualSince" type="date" class="form-control form-control-sm">
          </div>
          <button class="btn btn-sm btn-primary" onclick="saveLightCycle(${id}, 'manual')">Save</button>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary" onclick="toggleLightCycleEdit()">
            <i class="bi bi-pencil me-1"></i>Change schedule
          </button>
        </div>` : ''}
      </div>
    </div>
    <div class="col-md-4">
      <div class="card p-3 h-100">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <span class="fw-semibold"><i class="bi bi-shield-exclamation me-1 text-danger"></i>Mating Restrictions</span>
        </div>
        <div id="matingRestrictionInfo">
          ${(() => {
            const restrictions = [];
            const ageW = f.birth_date ? (typeof weeksSince === 'function' ? weeksSince(f.birth_date) : null) : null;
            if (ageW != null && ageW <= 52) restrictions.push({label: 'Under-aged (≤52 weeks)', cls: 'warning'});
            if (ageW != null && ageW > 240) restrictions.push({label: 'Over-aged (>240 weeks) — higher resource cost', cls: 'secondary'});
            if (f.sex === 'male' && (f.color || '').toLowerCase().includes('albino')) restrictions.push({label: 'Albino male', cls: 'warning'});
            if (!restrictions.length) return '<div class="text-success small"><i class="bi bi-check-circle me-1"></i>No automatic restrictions</div>';
            return restrictions.map(r => `<div class="badge bg-${r.cls} text-wrap d-block mb-1 text-start">${r.label}</div>`).join('');
          })()}
        </div>
        <div class="text-muted small mt-2">Auto-calculated from age and color. Manual overrides removed.</div>
      </div>
    </div>
  </div>

  <ul class="nav nav-tabs mb-3" role="tablist">
    <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tMed">Medical Info</button></li>
    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tMating"><i class="bi bi-heart-fill me-1"></i>Mating History</button></li>
    ${isMat && f.sex === 'female' ? `<li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tLitter">Litters</button></li>` : ''}
    ${isMat && f.sex === 'male' ? `<li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tLitterFather"><i class="bi bi-egg me-1"></i>Litters (as Father)</button></li>` : ''}
    ${f.sex === 'female' ? `<li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tRepro"><i class="bi bi-heart me-1"></i>Estrus Status</button></li>` : ''}
    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tDist">Distribution</button></li>
    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tLocHistory"><i class="bi bi-geo-alt me-1"></i>Location History</button></li>
    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tLightHistory"><i class="bi bi-lightbulb me-1"></i>Light History</button></li>
    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tHistory">History</button></li>
  </ul>

  <div class="tab-content">

    <!-- Medical Info: vet log + status + health events + vaccinations + exams -->
    <div id="tMed" class="tab-pane active">
      <div class="d-flex flex-wrap gap-2 mb-3">
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="scrollMedSection('ferret-vet')">
          Veterinarian${(typeof vetFollowUpsOpen === 'function' && vetFollowUpsOpen(vetComms).length) ? ` <span class="badge bg-danger">${vetFollowUpsOpen(vetComms).length}</span>` : ''}
        </button>
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="scrollMedSection('ferret-status')">Status</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="scrollMedSection('ferret-events')">Health Events</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="scrollMedSection('ferret-vaccines')">Vaccinations</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="scrollMedSection('ferret-exams')">Exams</button>
      </div>

      ${typeof renderVetCommSection === 'function' ? renderVetCommSection(id, vetComms) : ''}

      <div id="ferret-status" class="mb-4">
        <div class="d-flex gap-2 mb-3 flex-wrap">
          <h6 class="fw-semibold text-muted small text-uppercase mb-0 align-self-center">Current Status</h6>
          ${canUpdate() ? `
          <button class="btn btn-sm btn-outline-primary ms-auto" onclick="openMedModal(${id},${f.medical_info_id})"><i class="bi bi-pencil me-1"></i>Edit Medical Info</button>
          <button class="btn btn-sm btn-primary" onclick="openProcedureModal(${id})"><i class="bi bi-plus-lg me-1"></i>Log Procedure</button>` : ''}
        </div>
        <div class="row g-3 mb-3">
          <div class="col-md-4"><span class="text-muted small d-block">Vital Status</span>
            <strong>${f.dead === '1'
            ? '<span class=\"badge bg-danger fs-6 px-3 py-2\">Deceased</span>'
            : (f.in_research == 1 || f.distributed != 1)
              ? '<span class=\"badge bg-success fs-6 px-3 py-2\">Alive</span>'
              : '<span class=\"badge fs-6 px-3 py-2\" style=\"background:#7c3aed;color:#fff\">Distributed</span>'}</strong></div>
          ${f.dead === '1' ? `
          <div class="col-md-4"><span class="text-muted small d-block">Date of Death</span>
            <strong>${fmtDate(f.death_date)}</strong></div>
          <div class="col-md-4"><span class="text-muted small d-block">Age at Death</span>
            <strong>${ferretAge(f.birth_date, f.death_date)}</strong></div>
          <div class="col-md-4"><span class="text-muted small d-block">Cause of Death</span>
            <strong>${(death && death.cause_of_death) || f.cause_of_death || '<span class=\"text-muted\">Not recorded</span>'}</strong></div>
          ` : (f.in_research != 1 && f.distributed == 1) ? `
          <div class="col-md-4"><span class="text-muted small d-block">Distribution Date</span>
            <strong>${fmtDate(f.distribution_date)}</strong></div>
          <div class="col-md-4"><span class="text-muted small d-block">Age at Distribution</span>
            <strong>${ferretAge(f.birth_date, f.distribution_date)}</strong></div>
          ${f.distributor_name ? `<div class="col-md-4"><span class="text-muted small d-block">Distributed To</span>
            <strong>${f.distributor_name}</strong></div>` : ''}
          ` : ''}
        </div>
        ${f.dead === '1' ? renderDeathLogSection(id, f, death) : ''}
        <h6 class="fw-semibold text-muted small text-uppercase mb-2">Spay / Castration</h6>
        <div class="row g-3 mb-3">
          <div class="col-md-4"><span class="text-muted small d-block">Status</span>
            <strong>${f.castrated_or_spayed === 'y' ? '<span class="badge bg-success">Yes</span>' : '<span class="badge bg-secondary">No</span>'}</strong></div>
          <div class="col-md-4"><span class="text-muted small d-block">Date</span><strong>${fmtDate(f.castration_or_spay_date)}</strong></div>
        </div>
        <div class="row g-3 mb-3">
          <div class="col-md-4"><span class="text-muted small d-block">Treatments</span><strong>${f.treatments || '—'}</strong></div>
          <div class="col-md-4"><span class="text-muted small d-block">Orders</span><strong>${f.orders || '—'}</strong></div>
        </div>
      </div>

      <div id="ferret-events" class="mb-4">
        <div class="d-flex align-items-center mb-2">
          <h6 class="fw-semibold text-muted small text-uppercase mb-0">Health Events</h6>
          ${canWrite() ? `<button class="btn btn-sm btn-primary ms-auto" onclick="openHealthModal(${id})"><i class="bi bi-plus-lg me-1"></i>Record Event</button>` : ''}
        </div>
        ${f.dead !== '1' && f.archived != 1 ? `
        <div class="card mb-3 p-3">
          <div class="fw-semibold small text-muted mb-2">Care needs</div>
          <div class="d-flex flex-wrap gap-3">
            <label class="mb-0"><input type="checkbox" class="form-check-input me-1" ${f.needs_bath == 1 ? 'checked' : ''} onchange="toggleCareNeed(${id},'bath',this.checked)">Needs a bath this week</label>
            <label class="mb-0"><input type="checkbox" class="form-check-input me-1" ${f.needs_nail_trim == 1 ? 'checked' : ''} onchange="toggleCareNeed(${id},'nail',this.checked)">Needs a nail trim</label>
          </div>
          <div class="text-muted small mt-1">Anyone can check these. A bath alert only appears after the bath box is checked.</div>
        </div>` : ''}
        ${health.filter(h => h.event_type === 'weight' && h.weight).length > 1 ? `
        <div class="card mb-3 p-3">
          <div class="fw-semibold small mb-2 text-muted">Weight Over Time (g)</div>
          <canvas id="weightChart" height="220"></canvas>
        </div>` : ''}
        <table class="table table-sm">
          <thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Weight</th><th>Notes</th><th>By</th>${canUpdate() ? '<th></th>' : ''}</tr></thead>
          <tbody>${health.length ? health.map(h => `
            <tr>
              <td>${fmtDate(h.event_date)}</td>
              <td class="text-muted">${fmtTime(h.created_at)}</td>
              <td><span class="badge bg-info text-dark">${h.event_type.replace('_', ' ')}</span></td>
              <td>${h.weight ? h.weight + ' g' : '—'}</td>
              <td>${h.notes || '—'}</td>
              <td class="text-muted">${h.recorded_by || '—'}</td>
              ${canUpdate() ? `<td>
                <div class="d-flex gap-1">
                  <button class="btn btn-sm btn-outline-secondary" onclick="openEditHealthModal(${h.health_event_id})" title="Edit"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger" onclick="deleteHealthEvent(${h.health_event_id}, ${id})" title="Delete"><i class="bi bi-trash"></i></button>
                </div>
              </td>` : ''}
            </tr>`).join('') : `<tr><td colspan="${canUpdate() ? 7 : 6}" class="text-muted text-center py-3">No health events</td></tr>`}
          </tbody>
        </table>
      </div>

      <div id="ferret-vaccines" class="mb-4">
        <div class="d-flex align-items-center mb-2">
          <h6 class="fw-semibold text-muted small text-uppercase mb-0">Vaccinations</h6>
          ${isMat ? `<button class="btn btn-sm btn-primary ms-auto" onclick="openVaccModal(${id})"><i class="bi bi-plus-lg me-1"></i>Record Vaccination</button>` : ''}
        </div>
        <table class="table table-sm">
          <thead><tr><th>Date</th><th>Type</th><th>Expires</th><th>Administered By</th><th>Notes</th><th>Recorded By</th></tr></thead>
          <tbody>${vacc.length ? vacc.map(v => `
            <tr>
              <td>${fmtDate(v.vaccination_date)}</td>
              <td>${v.vaccine_type}</td>
              <td>${fmtDate(v.expiration_date)}</td>
              <td><strong>${v.administered_by || '—'}</strong></td>
              <td>${v.notes || '—'}</td>
              <td class="text-muted">${v.recorded_by || '—'}</td>
            </tr>`).join('') : '<tr><td colspan="6" class="text-muted text-center py-3">No vaccinations</td></tr>'}
          </tbody>
        </table>
      </div>

      <div id="ferret-exams" class="mb-2">
        <div class="d-flex align-items-center mb-2">
          <h6 class="fw-semibold text-muted small text-uppercase mb-0">Exam / Health Check History</h6>
          ${canUpdate() ? `<button class="btn btn-sm btn-primary ms-auto" onclick="openExamNoteModal(${id})"><i class="bi bi-plus-lg me-1"></i>Add Exam Note</button>` : ''}
        </div>
        ${examNotes.length ? `
        <div class="d-flex flex-column gap-2 mb-3">
          ${examNotes.map(n => `
            <div class="border rounded p-3 bg-light">
              <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                <strong>${fmtDate(n.exam_date)}</strong>
                ${n.weight_grams != null ? `<span class="badge bg-secondary">${n.weight_grams} g</span>` : ''}
                ${n.status ? `<span class="badge bg-info text-dark">${n.status}</span>` : ''}
                ${n.performed_by ? `<span class="text-muted small ms-auto">By: ${n.performed_by}</span>` : ''}
              </div>
              ${n.notes ? `<div class="small" style="white-space:pre-wrap;line-height:1.6">${n.notes}</div>` : ''}
            </div>`).join('')}
        </div>` : `<p class="text-muted small">No exam notes recorded yet.</p>`}
        <h6 class="fw-semibold text-muted small text-uppercase mb-2">Surgical Procedure Log</h6>
        ${f.surgical_procedure_log
            ? `<div class="border rounded p-3 bg-light small" style="white-space:pre-wrap;line-height:1.7">${f.surgical_procedure_log}</div>`
            : `<p class="text-muted small">No procedures logged yet.</p>`}
      </div>
    </div>

    <!-- Mating History -->
    <div id="tMating" class="tab-pane">
      <div class="d-flex mb-2">
        ${canUpdate() ? `<button class="btn btn-sm btn-primary ms-auto" onclick="openMatingModal(${id})"><i class="bi bi-plus-lg me-1"></i>Record Mating</button>` : ''}
      </div>
      <table class="table table-sm">
        <thead><tr><th>Date</th><th>Female</th><th>Male</th><th>Pulled Date</th><th>Expected Litter</th><th>Notes</th><th>Recorded By</th><th></th>${roleIs('admin', 'research') ? '<th></th>' : ''}</tr></thead>
        <tbody>${matings.length ? matings.map(m => `
          <tr>
            <td>${fmtDate(m.event_date)}</td>
            <td><strong>${m.female_name}</strong></td>
            <td><strong>${m.male_name || '—'}</strong>${canUpdate() ? ` <button class="btn btn-sm btn-outline-secondary py-0 px-1" title="Edit partner" onclick="openEditPartnerModal(${m.female_id},${m.event_id},${m.male_id || 'null'})"><i class="bi bi-pencil"></i></button>` : ''}</td>
            <td>${m.pulled_date ? fmtDate(m.pulled_date) : '<span class="text-muted">Not set</span>'}</td>
            <td class="small">${expectedLitterRangeLabel(m)}</td>
            <td class="small">${m.notes || '—'}</td>
            <td class="text-muted small">${m.recorded_by || '—'}</td>
            <td>${canUpdate() ? `<button class="btn btn-sm btn-outline-secondary" onclick="openPulledDateModal(${m.female_id},${m.event_id},'${m.pulled_date ? String(m.pulled_date).slice(0, 10) : ''}')"><i class="bi bi-calendar-check"></i></button>` : ''}</td>
            ${roleIs('admin', 'research') ? `<td><button class="btn btn-sm btn-outline-danger" onclick="deleteReproEvent(${m.female_id},${m.event_id})"><i class="bi bi-trash"></i></button></td>` : ''}
          </tr>`).join('') : `<tr><td colspan="${roleIs('admin', 'research') ? 8 : 7}" class="text-muted text-center py-3">No matings recorded</td></tr>`}
        </tbody>
      </table>
    </div>

    <!-- Litters -->
    ${isMat ? `
    <div id="tLitter" class="tab-pane">
      <div class="d-flex mb-2">
        <button class="btn btn-sm btn-primary ms-auto" onclick="openLitterModal(${id})"><i class="bi bi-plus-lg me-1"></i>Add Litter</button>
      </div>
      <table class="table table-sm">
        <thead><tr><th>Date</th><th>Litter ID</th><th>Kits</th><th>Stillborn</th><th>Kit deaths</th><th>Father</th><th>Created</th><th>Notes</th><th></th></tr></thead>
        <tbody>${litters.length ? litters.map(l => {
          const creatable = litterCreatableCount(l);
          return `
          <tr>
            <td>${fmtDate(l.litter_date)}</td>
            <td>${l.litter_id || '—'}</td>
            <td>${l.kit_count ?? '—'}</td>
            <td>${l.stillborn ?? '—'}</td>
            <td>${l.infant_deaths ?? 0}</td>
            <td>${l.father || '—'}</td>
            <td>${l.individuals_created ?? 0} / ${creatable}</td>
            <td class="small">${l.anomalies_and_notes || '—'}</td>
            <td>
              <div class="d-flex gap-1 flex-wrap">
                <button class="btn btn-sm btn-outline-secondary" onclick="openLitterDetailModal(${l.litter_log_id})"><i class="bi bi-journal-medical me-1"></i>Care Log</button>
                ${canUpdate() && (!l.individuals_created || l.individuals_created < creatable)
            ? `<button class="btn btn-xs btn-outline-success btn-sm" onclick="openCreateFromLitter(${l.litter_log_id})"><i class="bi bi-egg me-1"></i>Create Ferrets</button>` : ''}
              </div>
            </td>
          </tr>`;
        }).join('') : '<tr><td colspan="9" class="text-muted text-center py-3">No litter records</td></tr>'}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Litters (as Father) — males only -->
    ${isMat && f.sex === 'male' ? `
    <div id="tLitterFather" class="tab-pane">
      ${(function () {
        const totalKits = fatherLitters.reduce((sum, l) => sum + (l.kit_count || 0), 0);
        const totalSurviving = fatherLitters.reduce((sum, l) => sum + litterCreatableCount(l), 0);
        return `<div class="alert alert-info small mb-3">
          <strong>${fatherLitters.length}</strong> litter(s) fathered &nbsp;·&nbsp;
          <strong>${totalKits}</strong> total kit(s) &nbsp;·&nbsp;
          <strong>${totalSurviving}</strong> surviving
        </div>`;
      })()}
      <table class="table table-sm">
        <thead><tr><th>Date</th><th>Litter ID</th><th>Mother</th><th>Kits</th><th>Stillborn</th><th>Kit deaths</th><th>Surviving</th><th>Notes</th></tr></thead>
        <tbody>${fatherLitters.length ? fatherLitters.map(l => `
          <tr style="cursor:pointer" onclick="loadFerretDetail(${l.ferret_id})">
            <td>${fmtDate(l.litter_date)}</td>
            <td>${l.litter_id || '—'}</td>
            <td><strong>${l.jill_name}</strong></td>
            <td>${l.kit_count ?? '—'}</td>
            <td>${l.stillborn ?? '—'}</td>
            <td>${l.infant_deaths ?? 0}</td>
            <td>${litterCreatableCount(l)}</td>
            <td class="small">${l.anomalies_and_notes || '—'}</td>
          </tr>`).join('') : '<tr><td colspan="8" class="text-muted text-center py-3">No litters recorded with this ferret as father</td></tr>'}
        </tbody>
      </table>
      <div class="text-muted small mt-2"><i class="bi bi-info-circle me-1"></i>Matched by this ferret's current name against each litter's recorded father — renaming a ferret after litters are logged won't retroactively update older matches.</div>
    </div>` : ''}

    <!-- Distribution -->
    <div id="tDist" class="tab-pane">
      <div id="distFerretHistory">
        <div class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm" role="status"></div> Loading…</div>
      </div>
    </div>

    <!-- Reproductive (females only) -->
    ${f.sex === 'female' ? `
    <div id="tRepro" class="tab-pane">
      <div class="d-flex align-items-center gap-2 mb-3">
        ${canUpdate() ? `<button class="btn btn-sm btn-primary ms-auto" onclick="openReproModal(${id})"><i class="bi bi-plus-lg me-1"></i>Record Event</button>` : ''}
      </div>
      <div class="row g-3 mb-3">
        <div class="col-12">
          <div class="card p-3" style="border-left:4px solid ${f.female_status && f.female_status !== 'baseline' ? '#dc3545' : '#dee2e6'}">
            <div class="d-flex align-items-center gap-3">
              <div>
                <div class="text-muted small mb-1">Current Estrus Status</div>
                <div class="row g-3 mb-3">
                  <div class="col-12">
                    <div class="card p-3 d-flex flex-row align-items-center justify-content-between">
                      <div>
                        <span class="fw-semibold"><i class="bi bi-slash-circle me-1 text-secondary"></i>Retired from Breeding</span>
                        <div class="text-muted small mt-1">Excludes this female from the Dashboard Reproductive Status Board (e.g. over-aged, retired breeder).</div>
                      </div>
                      ${canUpdate() ? `
                      <div class="form-check form-switch ms-3">
                        <input class="form-check-input" type="checkbox" id="breedingRetiredToggle"
                          ${f.breeding_retired ? 'checked' : ''}
                          onchange="toggleBreedingRetired(${id}, this.checked)"
                          style="width:2.5em;height:1.4em;cursor:pointer;">
                      </div>` : `
                      <span class="badge ${f.breeding_retired ? 'bg-secondary' : 'bg-success'}">${f.breeding_retired ? 'Retired' : 'Active'}</span>`}
                    </div>
                  </div>
                </div>
                ${(function () {
          const s = f.female_status || 'baseline';
          const meta = { baseline: { label: 'Baseline', color: 'secondary' }, estrus: { label: 'In Estrus', color: 'danger' }, mated: { label: 'Mated', color: 'warning' }, littered: { label: 'Littered', color: 'success' }, weaned: { label: 'Weaned', color: 'info' } };
          const m = meta[s] || meta.baseline;
          return `<span class="badge bg-${m.color} fs-6 px-3 py-2">${m.label}</span>`;
        })()}
              </div>
            </div>
          </div>
        </div>
      </div>
      ${repro.length ? `
      <table class="table table-sm table-hover">
        <thead><tr><th>Date</th><th>Event</th><th>Partner</th><th>Pulled Date</th><th>Expected Litter</th><th>Photo</th><th>Notes</th><th>Recorded By</th>${roleIs('admin', 'research') ? '<th></th>' : ''}</tr></thead>
        <tbody>${repro.map(e => {
          const meta = { estrus: { label: 'In Estrus', color: 'danger' }, mated: { label: 'Mated', color: 'warning' }, littered: { label: 'Littered', color: 'success' }, weaned: { label: 'Weaned', color: 'info' }, no_litter: { label: 'No Litter', color: 'secondary' } };
          const m = meta[e.event_type] || { label: e.event_type, color: 'secondary' };
          const isMated = e.event_type === 'mated';
          return `<tr>
            <td>${fmtDate(e.event_date)}</td>
            <td><span class="badge bg-${m.color}">${m.label}</span></td>
            <td>${e.partner_name ? `<strong>${e.partner_name}</strong>` : '—'}${isMated && canUpdate() ? ` <button class="btn btn-sm btn-outline-secondary py-0 px-1" title="Edit partner" onclick="openEditPartnerModal(${id},${e.event_id},${e.partner_id || 'null'})"><i class="bi bi-pencil"></i></button>` : ''}</td>
            <td>${isMated ? (e.pulled_date ? fmtDate(e.pulled_date) : '<span class="text-muted">Not set</span>') + (canUpdate() ? ` <button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="openPulledDateModal(${id},${e.event_id},'${e.pulled_date ? String(e.pulled_date).slice(0, 10) : ''}')"><i class="bi bi-calendar-check"></i></button>` : '') : '—'}</td>
            <td class="small">${isMated ? expectedLitterRangeLabel(e) : '—'}</td>
            <td>${e.photo_url ? `<img src="${e.photo_url}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;cursor:pointer" onclick="window.open('${e.photo_url}','_blank')">` : '—'}</td>
            <td class="small">${e.notes || '—'}</td>
            <td class="text-muted small">${e.recorded_by || '—'}</td>
            ${roleIs('admin', 'research') ? `<td><button class="btn btn-sm btn-outline-danger" onclick="deleteReproEvent(${id},${e.event_id})"><i class="bi bi-trash"></i></button></td>` : ''}
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<p class="text-muted small">No reproductive events recorded.</p>'}
    </div>` : ''}

    <!-- Location History (every former room) -->
    <div id="tLocHistory" class="tab-pane">
      <table class="table table-sm">
        <thead><tr><th>Room</th><th>Cage</th><th>Moved In</th><th>Moved Out</th></tr></thead>
        <tbody id="locHistoryTable">
          <tr><td colspan="4" class="text-muted text-center py-3"><div class="spinner-border spinner-border-sm" role="status"></div> Loading…</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Light History -->
    <div id="tLightHistory" class="tab-pane">
      <p class="text-muted small mb-2">Continuous periods on each light schedule — moves between rooms that share the same schedule do <strong>not</strong> reset the clock (From / Duration stay the same; Rooms updates). "Until" is the day the schedule changed or the animal left the colony. Rooms that only exist as historical import placeholders (no physical cages) inherit the previous known schedule rather than inventing one. When mode is <strong>Manual</strong>, the current (Ongoing) row follows the Light Cycle card above instead of the room schedule.</p>
      <table class="table table-sm">
        <thead><tr><th>Schedule</th><th>From</th><th>Until</th><th>Duration</th><th>Rooms</th></tr></thead>
        <tbody id="lightHistoryTable">
          <tr><td colspan="5" class="text-muted text-center py-3"><div class="spinner-border spinner-border-sm" role="status"></div> Loading…</td></tr>
        </tbody>
      </table>
    </div>

    <!-- History -->
    <div id="tHistory" class="tab-pane">
      <div class="timeline ps-2">
        ${history.length ? history.map(h => {
        const { icon, color } = historyMeta(h.action);
        return `
        <div class="d-flex gap-3 mb-3 align-items-start">
          <div class="history-icon bg-${color} bg-opacity-10 text-${color}">${icon}</div>
          <div class="flex-grow-1">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="badge bg-secondary action-type">${h.action}</span>
              <strong class="small">${h.full_name || h.username}</strong>${h.full_name && h.username && h.full_name !== h.username ? ` <span class="text-muted">(${h.username})</span>` : ''}
              <span class="text-muted small ms-auto">${fmtDT(h.created_at)}</span>
            </div>
            ${h.details ? `<div class="text-muted small mt-1">${h.details}</div>` : ''}
          </div>
        </div>`;
      }).join('') : '<p class="text-muted small">No history yet.</p>'}
      </div>
    </div>

  </div>`;

    // Weight chart
    const canvas = document.getElementById('weightChart');
    if (canvas) {
      const weightData = health.filter(h => h.event_type === 'weight' && h.weight)
        .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
      new Chart(canvas, {
        type: 'line',
        data: {
          labels: weightData.map(h => fmtDate(h.event_date)),
          datasets: [{
            label: 'Weight (g)', data: weightData.map(h => h.weight),
            borderColor: '#0d6efd', backgroundColor: 'rgba(13,110,253,.08)', tension: .3, fill: true, pointRadius: 4
          }]
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false } } }
      });
    }

    loadRfidDisplay(id);
    loadFerretDistHistory(id);
    loadLocationHistory(id);
    loadLightHistory(id);
  } catch (err) { el.innerHTML = `<div class="alert alert-danger">${err.message}</div>`; }
}

// ─── Print complete ferret record (every tab) ────────────────────────────────
function _printEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _printAbsUrl(u) {
  if (!u) return '';
  try { return new URL(u, window.location.origin).href; } catch (_) { return String(u); }
}

function _printDash(v) {
  if (v == null || v === '') return '—';
  return _printEsc(v);
}

function _printStatusLabel(f) {
  if (f.archived == 1) return 'Archived';
  if (f.in_research == 1 && f.dead !== '1') return 'Research';
  if (f.distributed == 1) return 'Distributed';
  if (f.distribution_tag) return f.distribution_tag === 'research' ? 'Pending research' : 'Pending offsite';
  if (f.dead === '1') return 'Deceased';
  return 'Active';
}

function _printTable(headers, rowsHtml, emptyCols, emptyText) {
  if (!rowsHtml) {
    return '<table><thead><tr>' + headers.map(h => '<th>' + h + '</th>').join('') +
      '</tr></thead><tbody><tr><td colspan="' + emptyCols + '" class="empty">' + emptyText + '</td></tr></tbody></table>';
  }
  return '<table><thead><tr>' + headers.map(h => '<th>' + h + '</th>').join('') +
    '</tr></thead><tbody>' + rowsHtml + '</tbody></table>';
}

function _printKv(label, value) {
  return '<div class="kv"><span class="k">' + _printEsc(label) + '</span><span class="v">' +
    (value == null || value === '' ? '—' : value) + '</span></div>';
}

function _printWeightChart(health) {
  const points = (health || [])
    .filter(h => h && h.event_type === 'weight' && h.weight != null && h.weight !== '')
    .map(h => ({ date: h.event_date, label: fmtDate(h.event_date), value: Number(h.weight) }))
    .filter(p => Number.isFinite(p.value))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (points.length < 2) return '';

  const W = 720, H = 220;
  const pad = { top: 16, right: 16, bottom: 32, left: 48 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const minV = Math.min.apply(null, points.map(p => p.value));
  const maxV = Math.max.apply(null, points.map(p => p.value));
  const span = maxV - minV;
  const padV = span === 0 ? Math.max(20, maxV * 0.08) : span * 0.12;
  const yMin = minV - padV;
  const yMax = maxV + padV;
  const yRange = yMax - yMin || 1;
  const times = points.map(p => new Date(p.date).getTime());
  const tMin = Math.min.apply(null, times);
  const tMax = Math.max.apply(null, times);
  const tRange = (tMax - tMin) || 1;
  const xAt = i => pad.left + ((times[i] - tMin) / tRange) * innerW;
  const yAt = v => pad.top + innerH - ((v - yMin) / yRange) * innerH;

  const line = points.map((p, i) => (i ? 'L' : 'M') + xAt(i).toFixed(1) + ',' + yAt(p.value).toFixed(1)).join(' ');
  const area = line + ' L' + xAt(points.length - 1).toFixed(1) + ',' + (pad.top + innerH).toFixed(1)
    + ' L' + xAt(0).toFixed(1) + ',' + (pad.top + innerH).toFixed(1) + ' Z';

  const tickCount = 4;
  let ticks = '';
  for (let t = 0; t <= tickCount; t++) {
    const v = yMin + (yRange * t) / tickCount;
    const y = yAt(v);
    ticks += '<line x1="' + pad.left + '" y1="' + y.toFixed(1) + '" x2="' + (W - pad.right) + '" y2="' + y.toFixed(1)
      + '" stroke="#e5e7eb"/>'
      + '<text x="' + (pad.left - 6) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" font-size="10" fill="#555">'
      + Math.round(v) + '</text>';
  }

  const labelIdx = [];
  if (points.length <= 6) {
    for (let i = 0; i < points.length; i++) labelIdx.push(i);
  } else {
    labelIdx.push(0, Math.round((points.length - 1) / 3), Math.round(2 * (points.length - 1) / 3), points.length - 1);
  }
  const seen = {};
  const xLabels = labelIdx.filter(i => { if (seen[i]) return false; seen[i] = true; return true; }).map(i =>
    '<text x="' + xAt(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="#555">'
    + _printEsc(points[i].label) + '</text>'
  ).join('');

  const dots = points.map((p, i) =>
    '<circle cx="' + xAt(i).toFixed(1) + '" cy="' + yAt(p.value).toFixed(1)
    + '" r="3.2" fill="#0d6efd" stroke="#fff" stroke-width="1"/>'
  ).join('');

  const first = points[0], last = points[points.length - 1];
  const delta = last.value - first.value;
  const deltaLabel = (delta > 0 ? '+' : '') + Math.round(delta) + ' g';

  return '<div class="weight-chart">'
    + '<div class="caption">Weight over time (g) · ' + points.length + ' readings · '
    + _printEsc(first.label) + ' → ' + _printEsc(last.label)
    + ' · ' + Math.round(first.value) + '–' + Math.round(last.value) + ' g (' + _printEsc(deltaLabel) + ')</div>'
    + '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="Weight over time">'
    + '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff"/>'
    + ticks
    + '<line x1="' + pad.left + '" y1="' + (pad.top + innerH) + '" x2="' + (W - pad.right) + '" y2="' + (pad.top + innerH) + '" stroke="#9aa3b2"/>'
    + '<line x1="' + pad.left + '" y1="' + pad.top + '" x2="' + pad.left + '" y2="' + (pad.top + innerH) + '" stroke="#9aa3b2"/>'
    + '<path d="' + area + '" fill="rgba(13,110,253,.10)"/>'
    + '<path d="' + line + '" fill="none" stroke="#0d6efd" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
    + dots
    + xLabels
    + '</svg></div>';
}

async function printFerretCard(id) {
  id = id || _currentFerretId;
  if (!id) {
    alert('Open a ferret first.');
    return;
  }
  if (printFerretCard._busy) return;
  printFerretCard._busy = true;
  try {
    const [f, health, vacc, litters, history, repro, examNotes, matings, fatherLitters, rfids, distEvents, locHist, lightHist, researchHist, vetComms] = await Promise.all([
      api(`/ferrets/${id}`),
      api(`/ferrets/${id}/health`).catch(() => []),
      api(`/ferrets/${id}/vaccinations`).catch(() => []),
      api(`/ferrets/${id}/litters`).catch(() => []),
      api(`/ferrets/${id}/history`).catch(() => []),
      api(`/ferrets/${id}/reproductive`).catch(() => []),
      api(`/ferrets/${id}/exam-notes`).catch(() => []),
      api(`/ferrets/${id}/matings`).catch(() => []),
      api(`/ferrets/${id}/litters-as-father`).catch(() => []),
      api(`/ferrets/${id}/rfid`).catch(() => []),
      api(`/ferrets/${id}/distribution`).catch(() => []),
      api(`/ferrets/${id}/location-history`).catch(() => []),
      api(`/ferrets/${id}/light-history`).catch(() => []),
      api(`/ferrets/${id}/research`).catch(() => []),
      api(`/ferrets/${id}/vet-communications`).catch(() => [])
    ]);
    const html = buildFerretPrintDocument(f, {
      health: health || [],
      vacc: vacc || [],
      litters: litters || [],
      history: history || [],
      repro: repro || [],
      examNotes: examNotes || [],
      matings: matings || [],
      fatherLitters: fatherLitters || [],
      rfids: rfids || [],
      distEvents: distEvents || [],
      locHist: locHist || [],
      lightHist: lightHist || [],
      researchHist: researchHist || [],
      vetComms: vetComms || []
    });
    const w = window.open('', '_blank');
    if (!w) {
      alert('Pop-up blocked. Allow pop-ups for this site to print the ferret record.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    api(`/ferrets/${id}/print`, { method: 'POST' }).catch(() => {});
  } catch (err) {
    alert('Could not build print view: ' + (err && err.message ? err.message : err));
  } finally {
    printFerretCard._busy = false;
  }
}

function buildFerretPrintDocument(f, d) {
  const esc = _printEsc;
  const death = f.death || null;
  const isMat = roleIs('admin', 'maternity');
  const showMed = true;
  const now = new Date();
  const printedAt = now.toLocaleString();
  const printedBy = USER
    ? (USER.full_name && USER.username && USER.full_name !== USER.username
      ? USER.full_name + ' (' + USER.username + ')'
      : (USER.full_name || USER.username || 'Unknown'))
    : 'Unknown';
  const status = _printStatusLabel(f);
  const sexLabel = f.sex ? f.sex.charAt(0).toUpperCase() + f.sex.slice(1) : '—';
  const ageLabel = f.in_research == 1 && f.dead !== '1'
    ? ferretAge(f.birth_date)
    : f.distributed == 1
      ? 'At distribution: ' + ferretAge(f.birth_date, f.distribution_date)
      : f.dead === '1'
        ? 'Lived ' + ferretAge(f.birth_date, f.death_date)
        : ferretAge(f.birth_date);
  const photo = f.photo_url
    ? '<img class="portrait" src="' + esc(_printAbsUrl(f.photo_url)) + '" alt="">'
    : '<div class="portrait placeholder">🐾</div>';

  const endCap = f.distributed == 1 ? f.distribution_date : (f.dead === '1' ? f.death_date : null);
  const lightWks = f.light_state_since ? weeksSince(f.light_state_since, endCap) : null;
  const lightFrozen = endCap ? ' (stopped at ' + fmtDate(endCap) + ')' : '';

  const restrictions = [];
  const ageW = f.birth_date ? weeksSince(f.birth_date) : null;
  if (ageW != null && Number(ageW) <= 52) restrictions.push('Under-aged (≤52 weeks)');
  if (ageW != null && Number(ageW) > 240) restrictions.push('Over-aged (>240 weeks) — higher resource cost');
  if (f.sex === 'male' && (f.color || '').toLowerCase().includes('albino')) restrictions.push('Albino male');

  const activeRfid = d.rfids.find(r => !r.unassigned_date);
  const rfidHist = d.rfids.filter(r => r.unassigned_date);

  const femaleStatusMeta = {
    baseline: 'Baseline', estrus: 'In Estrus', mated: 'Mated',
    littered: 'Littered', weaned: 'Weaned'
  };

  let banners = '';
  if (f.archived == 1) {
    banners += '<div class="banner">In archive'
      + (f.archived_by ? ' · archived by ' + esc(f.archived_by) : '')
      + (f.archived_at ? ' on ' + esc(String(f.archived_at).slice(0, 10)) : '')
      + '.</div>';
  }
  if (f.research) {
    banners += '<div class="banner">On research: <strong>' + esc(f.research.study_name) + '</strong>'
      + (f.research.sponsor ? ' · ' + esc(f.research.sponsor) : '')
      + ' · ' + esc(f.research.cohort || 'unassigned')
      + ' · since ' + esc(String(f.research.assigned_date || '').slice(0, 10))
      + (f.research.assignment_notes ? ' — ' + esc(f.research.assignment_notes) : '')
      + '</div>';
  }
  if (f.distribution_tag && f.in_research != 1 && f.distributed != 1) {
    banners += '<div class="banner">Tagged for <strong>'
      + (f.distribution_tag === 'research' ? 'on-site research' : 'offsite distribution') + '</strong>'
      + (f.distribution_tag_dest ? ' → ' + esc(f.distribution_tag_dest) : '')
      + (f.distribution_tagged_at ? ' · since ' + esc(String(f.distribution_tagged_at).slice(0, 10)) : '')
      + (f.distribution_tag_notes ? ' — ' + esc(f.distribution_tag_notes) : '')
      + '</div>';
  }

  const profileKvs = [
    _printKv('Animal ID', esc(fmtAid(f.animal_id))),
    _printKv('Age', esc(ageLabel)),
    _printKv('Status', esc(status)),
    _printKv('Birth Date', esc(fmtDate(f.birth_date))),
    _printKv('Sex', esc(sexLabel)),
    _printKv('Color', _printDash(f.color)),
    _printKv('Weight', f.weight ? esc(f.weight + ' g') : '—'),
    _printKv('Location', esc('Room ' + (f.room_id || '?') + ' · ' + (f.cage_address || '?') + (f.room_lighting ? ' · ' + f.room_lighting : ''))),
    _printKv('Supplier', _printDash(f.supplier_name)),
    _printKv('Acquisition', _printDash(f.acquisition_by)),
    _printKv('Mother', _printDash(f.mother_name)),
    _printKv('Father', _printDash(f.father_name)),
    _printKv('Litter ID', _printDash(f.litter_id)),
    _printKv('Litter Date', f.litter_date ? esc(fmtDate(f.litter_date)) : '—'),
    _printKv('Next Rabies Vacc.', esc(fmtDate(f.next_rabies_vaccine_due))),
    _printKv('Spayed/Castrated', f.castrated_or_spayed === 'y' ? 'Yes' : 'No'),
    _printKv('Spay/Castrate Date', esc(fmtDate(f.castration_or_spay_date))),
    _printKv('Last Exam', esc(fmtDate(f.last_exam_date)))
  ];
  if (f.dead === '1') {
    profileKvs.push(
      _printKv('Death Date', esc(fmtDate(f.death_date))),
      _printKv('Cause of Death', _printDash((death && death.cause_of_death) || f.cause_of_death))
    );
  }
  if (f.sex === 'female') {
    profileKvs.push(_printKv('Estrus Status', esc(femaleStatusMeta[f.female_status] || f.female_status || 'Baseline')));
    profileKvs.push(_printKv('Breeding', f.breeding_retired ? 'Retired' : 'Active'));
  }
  if (f.treatments) profileKvs.push(_printKv('Treatments', esc(f.treatments)));
  if (f.orders) profileKvs.push(_printKv('Orders', esc(f.orders)));

  const healthRows = d.health.length ? d.health.map(h =>
    '<tr><td>' + esc(fmtDate(h.event_date)) + '</td><td>' + esc(fmtTime(h.created_at)) +
    '</td><td>' + esc((h.event_type || '').replace(/_/g, ' ')) +
    '</td><td>' + (h.weight ? esc(h.weight + ' g') : '—') +
    '</td><td>' + _printDash(h.notes) +
    '</td><td>' + _printDash(h.recorded_by) + '</td></tr>'
  ).join('') : '';

  const vaccRows = d.vacc.length ? d.vacc.map(v =>
    '<tr><td>' + esc(fmtDate(v.vaccination_date)) + '</td><td>' + esc(v.vaccine_type) +
    '</td><td>' + esc(fmtDate(v.expiration_date)) +
    '</td><td>' + _printDash(v.administered_by) +
    '</td><td>' + _printDash(v.notes) +
    '</td><td>' + _printDash(v.recorded_by) + '</td></tr>'
  ).join('') : '';

  const matingRows = d.matings.length ? d.matings.map(m =>
    '<tr><td>' + esc(fmtDate(m.event_date)) + '</td><td>' + esc(m.female_name) +
    '</td><td>' + _printDash(m.male_name) +
    '</td><td>' + (m.pulled_date ? esc(fmtDate(m.pulled_date)) : 'Not set') +
    '</td><td>' + esc(expectedLitterRangeLabel(m)) +
    '</td><td>' + _printDash(m.notes) +
    '</td><td>' + _printDash(m.recorded_by) + '</td></tr>'
  ).join('') : '';

  const litterRows = d.litters.length ? d.litters.map(l =>
    '<tr><td>' + esc(fmtDate(l.litter_date)) + '</td><td>' + _printDash(l.litter_id) +
    '</td><td>' + _printDash(l.kit_count) +
    '</td><td>' + _printDash(l.stillborn) +
    '</td><td>' + esc(l.infant_deaths ?? 0) +
    '</td><td>' + _printDash(l.father) +
    '</td><td>' + esc((l.individuals_created ?? 0) + ' / ' + litterCreatableCount(l)) +
    '</td><td>' + _printDash(l.anomalies_and_notes) + '</td></tr>'
  ).join('') : '';

  const fatherRows = d.fatherLitters.length ? d.fatherLitters.map(l =>
    '<tr><td>' + esc(fmtDate(l.litter_date)) + '</td><td>' + _printDash(l.litter_id) +
    '</td><td>' + esc(l.jill_name) +
    '</td><td>' + _printDash(l.kit_count) +
    '</td><td>' + _printDash(l.stillborn) +
    '</td><td>' + esc(l.infant_deaths ?? 0) +
    '</td><td>' + esc(litterCreatableCount(l)) +
    '</td><td>' + _printDash(l.anomalies_and_notes) + '</td></tr>'
  ).join('') : '';

  const reproRows = d.repro.length ? d.repro.map(e => {
    const label = ({ estrus: 'In Estrus', mated: 'Mated', littered: 'Littered', weaned: 'Weaned', no_litter: 'No Litter' })[e.event_type] || e.event_type;
    const isMated = e.event_type === 'mated';
    return '<tr><td>' + esc(fmtDate(e.event_date)) + '</td><td>' + esc(label) +
      '</td><td>' + _printDash(e.partner_name) +
      '</td><td>' + (isMated ? (e.pulled_date ? esc(fmtDate(e.pulled_date)) : 'Not set') : '—') +
      '</td><td>' + (isMated ? esc(expectedLitterRangeLabel(e)) : '—') +
      '</td><td>' + _printDash(e.notes) +
      '</td><td>' + _printDash(e.recorded_by) + '</td></tr>';
  }).join('') : '';

  const distRows = d.distEvents.length ? d.distEvents.map(e =>
    '<tr><td>' + esc(fmtDate(e.distribution_date)) + '</td><td>' + esc(e.distributor_name) +
    (e.distributor_address ? '<div class="muted">' + esc(e.distributor_address) + '</div>' : '') +
    '</td><td>' + (e.price != null ? esc('$' + parseFloat(e.price).toFixed(2)) : '—') +
    '</td><td>' + _printDash(e.notes) +
    '</td><td>' + _printDash(e.recorded_by) + '</td></tr>'
  ).join('') : '';

  const locRows = d.locHist.length ? d.locHist.map(r =>
    '<tr><td>Room ' + esc(r.room_id ?? '?') + (r.room_name ? ' ' + esc(r.room_name) : '') +
    '</td><td>' + esc(r.cage_address || '—') + (r.room_lighting ? ' · ' + esc(r.room_lighting) : '') +
    '</td><td>' + esc(fmtDate(r.move_in)) +
    '</td><td>' + (r.move_out ? esc(fmtDate(r.move_out)) : 'Current') + '</td></tr>'
  ).join('') : '';

  const lightRows = d.lightHist.length ? d.lightHist.map(r => {
    const weeksDec = r.days != null ? (r.days / 7).toFixed(1) : (r.weeks != null ? Number(r.weeks).toFixed(1) : '0.0');
    const rooms = (r.rooms && r.rooms.length) ? r.rooms.map(id => 'Room ' + id).join(', ') : '—';
    return '<tr><td>' + (r.eight_hour_light ? '8-Hour (Winter)' : 'Standard (Summer)') +
      '</td><td>' + esc(fmtDate(r.start_date)) +
      '</td><td>' + (r.end_date ? esc(fmtDate(r.end_date)) : 'Ongoing') +
      '</td><td>' + esc(weeksDec + ' wk') +
      '</td><td>' + esc(rooms) + '</td></tr>';
  }).join('') : '';

  const histRows = d.history.length ? d.history.map(h =>
    '<tr><td>' + esc(fmtDT(h.created_at)) + '</td><td>' + esc(h.action) +
    '</td><td>' + esc(h.full_name || h.username || '—') +
    (h.full_name && h.username && h.full_name !== h.username ? ' <span class="muted">(' + esc(h.username) + ')</span>' : '') +
    '</td><td>' + _printDash(h.details) + '</td></tr>'
  ).join('') : '';

  const researchRows = d.researchHist.length ? d.researchHist.map(a =>
    '<tr><td>' + esc(a.study_name) + (a.sponsor ? '<div class="muted">' + esc(a.sponsor) + '</div>' : '') +
    '</td><td>' + _printDash(a.cohort) +
    '</td><td>' + esc(fmtDate(a.assigned_date)) +
    '</td><td>' + (a.ended_date ? esc(fmtDate(a.ended_date)) : 'Ongoing') +
    '</td><td>' + _printDash(a.outcome) +
    '</td><td>' + _printDash(a.notes) + '</td></tr>'
  ).join('') : '';

  const rfidHistRows = rfidHist.length ? rfidHist.map(r =>
    '<tr><td><code>' + esc(r.rfid) + '</code></td><td>' + esc(fmtDate(r.assigned_date)) +
    '</td><td>' + esc(fmtDate(r.unassigned_date)) +
    '</td><td>' + _printDash(r.reason) + '</td></tr>'
  ).join('') : '';

  let deathHtml = '';
  if (showMed && f.dead === '1') {
    const notes = (death && death.notes) || [];
    const photos = (death && death.photos) || [];
    const recordedWhen = death && death.recorded_at ? String(death.recorded_at).replace('T', ' ').slice(0, 16) : '';
    const recordedBy = death ? deathPersonLabel(death, death.recorded_by_email) : '';
    deathHtml = '<h2>Death Log</h2><div class="grid">'
      + _printKv('Food / water access', esc(ynuLabel(death && death.food_water_access)))
      + _printKv('Cage mates', esc(ynuLabel(death && death.cage_mates_present)))
      + _printKv('Cage mates healthy', esc(ynuLabel(death && death.cage_mates_healthy)))
      + _printKv('Recorded by', esc(recordedBy || '—') + (recordedWhen ? ' <span class="muted">· ' + esc(recordedWhen) + '</span>' : ''))
      + (death && death.cause_detail && death.cause_detail !== death.cause_of_death
        ? _printKv('Original cause text', esc(death.cause_detail)) : '')
      + '</div>';
    if (notes.length) {
      deathHtml += notes.map(n =>
        '<div class="note"><div class="note-meta"><strong>' +
        (n.note_type === 'necropsy' ? 'Necropsy' : 'Death') + '</strong> · ' +
        esc(n.created_at ? String(n.created_at).replace('T', ' ').slice(0, 16) : '') +
        ' · By: ' + esc(deathPersonLabel(n, n.created_by_email)) +
        '</div><div class="pre">' + esc(n.notes || '') + '</div></div>'
      ).join('');
    } else {
      deathHtml += '<p class="empty-text">No death / necropsy notes.</p>';
    }
    if (photos.length) {
      deathHtml += '<div class="photos">' + photos.map(p =>
        '<figure><img src="' + esc(_printAbsUrl(p.photo_url)) + '" alt="' + esc(p.kind) + '"><figcaption>' +
        esc(p.kind === 'necropsy' ? 'Necropsy' : 'Death') + '</figcaption></figure>'
      ).join('') + '</div>';
    } else {
      deathHtml += '<p class="empty-text">No death / necropsy photos.</p>';
    }
  }

  const vetList = d.vetComms || [];
  let vetHtml = '<h2>Veterinarian</h2>';
  if (vetList.length) {
    vetHtml += vetList.map(c => {
      const side = c.author_side === 'veterinarian' ? 'Veterinarian' : 'Staff';
      const kind = (c.kind || 'note').replace('_', '-');
      const fu = c.follow_up_date ? String(c.follow_up_date).slice(0, 10) : '';
      return '<div class="note"><div class="note-meta"><strong>' + esc(fmtDate(c.comm_date)) + '</strong> · '
        + esc(side) + ' · ' + esc(kind)
        + (c.vet_name ? ' · ' + esc(c.vet_name) : '')
        + (fu ? ' · Follow up ' + esc(fmtDate(fu)) + (c.follow_up_done ? ' (done)' : '') : '')
        + (c.recorded_by ? ' · By: ' + esc(c.recorded_by) : '')
        + '</div>' + (c.body ? '<div class="pre">' + esc(c.body) + '</div>' : '') + '</div>';
    }).join('');
  } else {
    vetHtml += '<p class="empty-text">No veterinarian notes.</p>';
  }

  let medicalHtml = '';
  if (showMed) {
    medicalHtml = '<h2>Medical Info</h2><div class="grid">'
      + _printKv('Vital Status', f.dead === '1' ? 'Deceased' : (f.in_research == 1 || f.distributed != 1 ? 'Alive' : 'Distributed'))
      + (f.dead === '1' ? _printKv('Age at Death', esc(ferretAge(f.birth_date, f.death_date))) : '')
      + (f.dead !== '1' && f.in_research != 1 && f.distributed == 1 ? _printKv('Distribution Date', esc(fmtDate(f.distribution_date))) : '')
      + (f.dead !== '1' && f.in_research != 1 && f.distributed == 1 ? _printKv('Age at Distribution', esc(ferretAge(f.birth_date, f.distribution_date))) : '')
      + (f.dead !== '1' && f.in_research != 1 && f.distributed == 1 && f.distributor_name ? _printKv('Distributed To', esc(f.distributor_name)) : '')
      + _printKv('Spay / Castration', f.castrated_or_spayed === 'y' ? 'Yes' : 'No')
      + _printKv('Spay / Castration Date', esc(fmtDate(f.castration_or_spay_date)))
      + _printKv('Treatments', _printDash(f.treatments))
      + _printKv('Orders', _printDash(f.orders))
      + (f.weight_loss_or_gain ? _printKv('Weight loss / gain', esc(f.weight_loss_or_gain)) : '')
      + (f.performed_by ? _printKv('Performed by', esc(f.performed_by)) : '')
      + '</div>';
    medicalHtml += '<h3>Exam / Health Check History</h3>';
    if (d.examNotes.length) {
      medicalHtml += d.examNotes.map(n =>
        '<div class="note"><div class="note-meta"><strong>' + esc(fmtDate(n.exam_date)) + '</strong>'
        + (n.weight_grams != null ? ' · ' + esc(n.weight_grams) + ' g' : '')
        + (n.status ? ' · ' + esc(n.status) : '')
        + (n.performed_by ? ' · By: ' + esc(n.performed_by) : '')
        + '</div>' + (n.notes ? '<div class="pre">' + esc(n.notes) + '</div>' : '') + '</div>'
      ).join('');
    } else {
      medicalHtml += '<p class="empty-text">No exam notes recorded.</p>';
    }
    if (f.exam_log) {
      medicalHtml += '<h3>Exam Log</h3><div class="note pre">' + esc(f.exam_log) + '</div>';
    }
    medicalHtml += '<h3>Surgical Procedure Log</h3>';
    medicalHtml += f.surgical_procedure_log
      ? '<div class="note pre">' + esc(f.surgical_procedure_log) + '</div>'
      : '<p class="empty-text">No procedures logged.</p>';
    medicalHtml += deathHtml;
  }

  let littersHtml = '';
  if (isMat && f.sex === 'female') {
    littersHtml = '<h2>Litters</h2>' + _printTable(
      ['Date', 'Litter ID', 'Kits', 'Stillborn', 'Kit deaths', 'Father', 'Created', 'Notes'],
      litterRows, 8, 'No litter records'
    );
  }
  if (isMat && f.sex === 'male') {
    const totalKits = d.fatherLitters.reduce((sum, l) => sum + (l.kit_count || 0), 0);
    const totalSurviving = d.fatherLitters.reduce((sum, l) => sum + litterCreatableCount(l), 0);
    littersHtml += '<h2>Litters (as Father)</h2><p class="muted">'
      + d.fatherLitters.length + ' litter(s) fathered · ' + totalKits + ' total kit(s) · '
      + totalSurviving + ' surviving</p>'
      + _printTable(
        ['Date', 'Litter ID', 'Mother', 'Kits', 'Stillborn', 'Kit deaths', 'Surviving', 'Notes'],
        fatherRows, 8, 'No litters recorded with this ferret as father'
      );
  }

  let reproHtml = '';
  if (f.sex === 'female') {
    reproHtml = '<h2>Estrus Status</h2><div class="grid">'
      + _printKv('Current Status', esc(femaleStatusMeta[f.female_status] || f.female_status || 'Baseline'))
      + _printKv('Breeding', f.breeding_retired ? 'Retired' : 'Active')
      + (f.estrus_status ? _printKv('Estrus check status', esc(f.estrus_status)) : '')
      + (f.vulva_description ? _printKv('Vulva description', esc(f.vulva_description)) : '')
      + (f.formed_observation ? _printKv('Formed observation', esc(f.formed_observation)) : '')
      + (f.estrus_comments ? _printKv('Estrus comments', esc(f.estrus_comments)) : '')
      + '</div>'
      + _printTable(
        ['Date', 'Event', 'Partner', 'Pulled Date', 'Expected Litter', 'Notes', 'Recorded By'],
        reproRows, 7, 'No reproductive events recorded'
      );
  }

  const title = 'Ferret record — ' + (f.ferret_name || 'Unknown') + ' · ' + fmtAid(f.animal_id);

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
    '<style>' +
    'body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:12.5px;color:#111;margin:18px;line-height:1.45}' +
    'h1{font-size:20px;margin:0 0 2px;color:#122754}' +
    'h2{font-size:14px;margin:18px 0 8px;padding:4px 8px;background:#122754;color:#fff;letter-spacing:.03em;text-transform:uppercase}' +
    'h3{font-size:12px;margin:12px 0 6px;color:#122754;text-transform:uppercase;letter-spacing:.03em}' +
    '.meta{color:#555;margin-bottom:10px}' +
    '.toolbar{display:flex;gap:8px;margin-bottom:12px}' +
    '.toolbar button{padding:6px 12px;font-size:13px;cursor:pointer}' +
    '.header{display:flex;gap:16px;align-items:flex-start;margin-bottom:12px}' +
    '.portrait{width:140px;height:140px;object-fit:cover;border-radius:8px;border:1px solid #ccc;background:#f3f4f6}' +
    '.portrait.placeholder{display:flex;align-items:center;justify-content:center;font-size:48px}' +
    '.idblock h1{display:inline-block;margin-right:8px}' +
    '.badge{display:inline-block;border:1px solid #122754;color:#122754;padding:1px 8px;border-radius:999px;font-size:11px;vertical-align:middle}' +
    '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 14px;margin:6px 0 10px}' +
    '.kv{break-inside:avoid}' +
    '.k{display:block;color:#666;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em}' +
    '.v{display:block;font-weight:600}' +
    'table{border-collapse:collapse;width:100%;margin:0 0 8px}' +
    'th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}' +
    'th{background:#eef1f6;font-size:11px}' +
    '.empty,.empty-text{color:#666;font-style:italic}' +
    '.muted{color:#555;font-size:11px}' +
    '.banner{border:1px solid #8aa8a1;background:#f3f7f6;padding:6px 8px;margin:6px 0;border-radius:4px}' +
    '.note{border:1px solid #ddd;padding:8px;margin:0 0 8px;border-radius:4px;background:#fafafa}' +
    '.note-meta{color:#555;font-size:11px;margin-bottom:4px}' +
    '.pre{white-space:pre-wrap;line-height:1.55}' +
    '.photos{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px}' +
    '.photos figure{margin:0}' +
    '.photos img{width:96px;height:96px;object-fit:cover;border:1px solid #ccc;border-radius:4px}' +
    '.photos figcaption{font-size:10px;color:#555;text-align:center}' +
    '.desc{white-space:pre-wrap;border:1px solid #ddd;padding:8px;border-radius:4px;background:#fafafa}' +
    '.weight-chart{margin:0 0 10px;border:1px solid #ddd;border-radius:4px;padding:8px 8px 4px;background:#fff;break-inside:avoid}' +
    '.weight-chart .caption{font-size:11px;color:#555;margin:0 0 4px}' +
    '@media print{body{margin:10px}.toolbar{display:none!important}h2{break-after:avoid}table,tr,figure,.note,.header,.weight-chart{break-inside:avoid}}' +
    '@page{margin:12mm}' +
    '</style></head><body>' +
    '<div class="toolbar no-print"><button onclick="window.print()">Print</button>' +
    '<button onclick="window.close()">Close</button></div>' +
    '<div class="header">' + photo +
    '<div class="idblock"><h1>' + esc(f.ferret_name || 'Unnamed') + '</h1>' +
    '<span class="badge">' + esc(status) + '</span>' +
    (f.dead === '1' && ((death && death.cause_of_death) || f.cause_of_death)
      ? ' <span class="badge">' + esc((death && death.cause_of_death) || f.cause_of_death) + '</span>' : '') +
    '<div class="meta">' + esc(fmtAid(f.animal_id)) + ' · ' + esc(sexLabel) + ' · ' + esc(ageLabel) + '</div>' +
    banners +
    '</div></div>' +
    '<h2>Profile</h2><div class="grid">' + profileKvs.join('') + '</div>' +
    (f.description ? '<h3>Description</h3><div class="desc">' + esc(f.description) + '</div>' : '') +
    '<h2>RFID Chip</h2>' +
    (activeRfid
      ? '<div class="grid">' + _printKv('Active chip', '<code>' + esc(activeRfid.rfid) + '</code>') +
        _printKv('Assigned', esc(fmtDate(activeRfid.assigned_date))) +
        _printKv('Reason', _printDash(activeRfid.reason)) +
        (activeRfid.notes ? _printKv('Notes', esc(activeRfid.notes)) : '') + '</div>'
      : '<p class="empty-text">No active RFID chip assigned.</p>') +
    (rfidHist.length
      ? '<h3>RFID History</h3>' + _printTable(['RFID', 'Assigned', 'Unassigned', 'Reason'], rfidHistRows, 4, 'None')
      : '') +
    '<h2>Light Cycle</h2><div class="grid">' +
    _printKv('Current cycle', f.eight_hour_light ? '8-Hour (Winter)' : 'Standard (Summer)') +
    _printKv('On this cycle', lightWks != null
      ? esc(lightWks + 'wk since ' + fmtDate(f.light_state_since) + lightFrozen)
      : 'Duration unknown') +
    '</div>' +
    '<h2>Mating Restrictions</h2>' +
    (restrictions.length
      ? '<ul>' + restrictions.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>'
      : '<p>No automatic restrictions.</p>') +
    '<h2>Health Events</h2>' + _printWeightChart(d.health) + _printTable(
      ['Date', 'Time', 'Type', 'Weight', 'Notes', 'By'], healthRows, 6, 'No health events'
    ) +
    '<h2>Vaccinations</h2>' + _printTable(
      ['Date', 'Type', 'Expires', 'Administered By', 'Notes', 'Recorded By'], vaccRows, 6, 'No vaccinations'
    ) +
    '<h2>Mating History</h2>' + _printTable(
      ['Date', 'Female', 'Male', 'Pulled Date', 'Expected Litter', 'Notes', 'Recorded By'], matingRows, 7, 'No matings recorded'
    ) +
    littersHtml +
    vetHtml +
    medicalHtml +
    reproHtml +
    '<h2>Distribution</h2>' + _printTable(
      ['Date', 'Distributor', 'Price', 'Notes', 'Recorded By'], distRows, 5, 'No distribution records'
    ) +
    '<h2>Research Assignments</h2>' + _printTable(
      ['Study', 'Cohort', 'Assigned', 'Ended', 'Outcome', 'Notes'], researchRows, 6, 'No research assignments'
    ) +
    '<h2>Location History</h2>' + _printTable(
      ['Room', 'Cage', 'Moved In', 'Moved Out'], locRows, 4, 'No location history recorded'
    ) +
    '<h2>Light History</h2>' + _printTable(
      ['Schedule', 'From', 'Until', 'Duration', 'Rooms'], lightRows, 5, 'No light history available'
    ) +
    '<h2>History</h2>' + _printTable(
      ['When', 'Action', 'User', 'Details'], histRows, 4, 'No history yet'
    ) +
    '<p class="meta" style="margin-top:16px">Printed ' + esc(printedAt) + ' · ' + esc(printedBy) +
    ' · SanusBio ferret record</p>' +
    '<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>' +
    '</body></html>';
}

// ─── Location History (former rooms) ──────────────────────────────────────────
async function loadLocationHistory(ferretId) {
  const el = document.getElementById('locHistoryTable');
  if (!el) return;
  try {
    const rows = await api(`/ferrets/${ferretId}/location-history`);
    if (!rows.length) {
      el.innerHTML = '<tr><td colspan="4" class="text-muted text-center py-3">No location history recorded.</td></tr>';
      return;
    }
    el.innerHTML = rows.map(r => `
      <tr class="${!r.move_out ? 'table-success bg-opacity-25' : ''}">
        <td>Room ${r.room_id ?? '?'}${r.room_name ? ' ' + r.room_name : ''}</td>
        <td>${r.cage_address || '—'}${r.room_lighting ? ' · ' + r.room_lighting : ''}</td>
        <td>${fmtDate(r.move_in)}</td>
        <td>${r.move_out ? fmtDate(r.move_out) : '<span class="badge bg-success">Current</span>'}</td>
      </tr>`).join('');
  } catch (err) {
    el.innerHTML = `<tr><td colspan="4" class="text-danger text-center py-2">${err.message}</td></tr>`;
  }
}

// ─── Light History (continuous schedule periods) ──────────────────────────────
async function loadLightHistory(ferretId) {
  const el = document.getElementById('lightHistoryTable');
  if (!el) return;
  try {
    const rows = await api(`/ferrets/${ferretId}/light-history`);
    if (!rows || !rows.length) {
      el.innerHTML = '<tr><td colspan="5" class="text-muted text-center py-3">No light history available (no location or room schedule data).</td></tr>';
      return;
    }
    el.innerHTML = rows.map(r => {
      const isOngoing = !r.end_date;
      const scheduleLabel = r.eight_hour_light
        ? '<span class="badge bg-warning text-dark">8-Hour (Winter)</span>'
        : '<span class="badge bg-secondary">Standard (Summer)</span>';
      const until = isOngoing
        ? '<span class="badge bg-success">Ongoing</span>'
        : fmtDate(r.end_date);
      const weeksDec = r.days != null ? (r.days / 7).toFixed(1) : (r.weeks != null ? Number(r.weeks).toFixed(1) : '0.0');
      const duration = `${weeksDec} wk`;
      const rooms = (r.rooms && r.rooms.length)
        ? r.rooms.map(id => `Room ${id}`).join(', ')
        : '—';
      return `
      <tr class="${isOngoing ? 'table-success bg-opacity-25' : ''}">
        <td>${scheduleLabel}</td>
        <td>${fmtDate(r.start_date)}</td>
        <td>${until}</td>
        <td>${duration}</td>
        <td class="text-muted small">${rooms}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    el.innerHTML = `<tr><td colspan="5" class="text-danger text-center py-2">${err.message}</td></tr>`;
  }
}

function historyMeta(action) {
  const map = {
    CREATE: { icon: '＋', color: 'success' },
    UPDATE: { icon: '✏', color: 'primary' },
    DELETE: { icon: '✕', color: 'danger' },
    MOVE: { icon: '→', color: 'info' },
    COMPLETE: { icon: '✓', color: 'success' },
    PHOTO_UPLOAD: { icon: '📷', color: 'secondary' },
    PROCEDURE: { icon: '🏥', color: 'warning' },
    PRINT: { icon: '🖨', color: 'secondary' },
    VET_COMM: { icon: '🩺', color: 'info' },
    EXAM_NOTE: { icon: '📋', color: 'info' },
    LOGIN: { icon: '🔑', color: 'secondary' },
  };
  return map[action] || { icon: '•', color: 'secondary' };
}

function toggleMrOtherBox() {
  const checked = document.getElementById('mrOther').checked;
  document.getElementById('mrOtherBox').style.display = checked ? '' : 'none';
}

// ─── RFID ─────────────────────────────────────────────────────────────────────
async function loadRfidDisplay(ferretId) {
  const el = document.getElementById('rfidDisplay');
  if (!el) return;
  try {
    const rfids = await api(`/ferrets/${ferretId}/rfid`);
    const active = rfids.find(r => !r.unassigned_date);
    const history = rfids.filter(r => r.unassigned_date);
    if (!active && !history.length) {
      el.innerHTML = '<div class="text-muted small text-center py-2">No RFID chip assigned</div>';
      return;
    }
    el.innerHTML = `
  ${active ? `
    <div class="d-flex align-items-center gap-2 mb-2">
      <span class="badge bg-success">Active</span>
      <code class="fs-6 fw-bold">${active.rfid}</code>
      ${canUnassignRfid() ? `<button class="btn btn-sm btn-outline-danger ms-auto" onclick="unassignRfid(${ferretId})"><i class="bi bi-x-circle me-1"></i>Unassign</button>` : ''}
    </div>
    <div class="text-muted small">Assigned ${fmtDate(active.assigned_date)}${active.reason ? ' · ' + active.reason : ''}${active.notes ? '<br>' + active.notes : ''}</div>
  ` : '<div class="text-muted small mb-2">No active chip</div>'}
  ${history.length ? `
    <details class="mt-2">
      <summary class="text-muted small" style="cursor:pointer">History (${history.length})</summary>
      <table class="table table-sm mt-1 mb-0">
        <thead><tr><th>RFID</th><th>Assigned</th><th>Unassigned</th><th>Reason</th></tr></thead>
        <tbody>${history.map(r => `
          <tr class="text-muted small">
            <td><code>${r.rfid}</code></td>
            <td>${fmtDate(r.assigned_date)}</td>
            <td>${fmtDate(r.unassigned_date)}</td>
            <td>${r.reason || '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </details>` : ''}`;
  } catch (err) {
    el.innerHTML = '<div class="text-danger small">Failed to load RFID data</div>';
  }
}

function openRfidModal(ferretId) {
  document.getElementById('rfidFerretId').value = ferretId;
  document.getElementById('rfidValue').value = '';
  document.getElementById('rfidReason').value = '';
  document.getElementById('rfidNotes').value = '';
  new bootstrap.Modal(document.getElementById('rfidModal')).show();
}

async function submitRfid() {
  const ferretId = document.getElementById('rfidFerretId').value;
  const rfid = document.getElementById('rfidValue').value.trim();
  if (!rfid) return alert('Please enter an RFID value.');
  try {
    await api(`/ferrets/${ferretId}/rfid`, {
      method: 'POST', body: {
        rfid,
        reason: document.getElementById('rfidReason').value || null,
        notes: document.getElementById('rfidNotes').value || null
      }
    });
    bootstrap.Modal.getInstance(document.getElementById('rfidModal')).hide();
    loadRfidDisplay(ferretId);
  } catch (err) { alert(err.message); }
}

async function unassignRfid(ferretId) {
  if (!canUnassignRfid()) return alert('Only Admin or Research can unassign an RFID tag.');
  if (!confirm('Unassign the active RFID chip from this ferret?')) return;
  try {
    await api(`/ferrets/${ferretId}/rfid/unassign`, { method: 'PUT', body: { reason: 'manual_unassign' } });
    loadRfidDisplay(ferretId);
  } catch (err) { alert(err.message); }
}

// ─── Dashboard Ferret Lookup (Name + RFID) ────────────────────────────────────
let _nfcReader = null, _nfcActive = false;

function initDashLookups() {
  const nameInput = document.getElementById('dashNameLookupInput');
  const rfidInput = document.getElementById('dashRfidLookupInput');
  if (!nameInput || !rfidInput) return;

  document.getElementById('dashNameLookupResult').innerHTML = '';
  nameInput.value = '';
  document.getElementById('dashRfidLookupResult').innerHTML = '';
  rfidInput.value = '';

  const banner = document.getElementById('dashNfcStatusBanner');
  banner.classList.add('d-none');
  if ('NDEFReader' in window) {
    document.getElementById('dashNfcScanWrap').classList.remove('d-none');
    banner.textContent = '✅ Web NFC is supported on this device.';
    banner.className = 'alert alert-success py-2 small mb-2';
    banner.classList.remove('d-none');
  } else {
    document.getElementById('dashNfcScanWrap').classList.add('d-none');
    banner.innerHTML = '⚠️ Web NFC is not available in this browser. Use a USB RFID wedge reader or type the chip value manually.';
    banner.className = 'alert alert-warning py-2 small mb-2';
    banner.classList.remove('d-none');
  }
}

async function doDashNameLookup() {
  const val = document.getElementById('dashNameLookupInput').value.trim();
  if (!val) return;
  const resultEl = document.getElementById('dashNameLookupResult');
  resultEl.innerHTML = '<div class="text-center text-muted py-2"><div class="spinner-border spinner-border-sm me-2"></div>Searching…</div>';
  try {
    const matches = await api('/ferrets?search=' + encodeURIComponent(val));
    if (!matches.length) {
      resultEl.innerHTML = `
        <div class="alert alert-danger d-flex align-items-center gap-2 py-2 small mb-0">
          <i class="bi bi-exclamation-octagon-fill"></i>
          <div>No ferret found matching "${val}".</div>
        </div>`;
    } else if (matches.length === 1) {
      resultEl.innerHTML = '';
      loadFerretDetail(matches[0].id);
    } else {
      resultEl.innerHTML = `
        <div class="text-muted small mb-2">${matches.length} matches — pick one:</div>
        <div class="list-group">
          ${matches.slice(0, 8).map(f => `
            <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
              onclick="loadFerretDetail(${f.id})">
              <span><strong>${f.name}</strong> ${f.animal_id ? `<span class="text-muted small">· ID ${f.animal_id}</span>` : ''}</span>
              <i class="bi bi-chevron-right text-muted"></i>
            </button>`).join('')}
        </div>`;
    }
  } catch (err) {
    resultEl.innerHTML = `<div class="alert alert-warning py-2 small mb-0">Error: ${err.message}</div>`;
  }
}

async function doDashRfidLookup(rfidOverride) {
  const val = (rfidOverride || document.getElementById('dashRfidLookupInput').value).trim();
  if (!val) return;
  const resultEl = document.getElementById('dashRfidLookupResult');
  resultEl.innerHTML = '<div class="text-center text-muted py-2"><div class="spinner-border spinner-border-sm me-2"></div>Looking up…</div>';
  try {
    const f = await api(`/rfid/lookup/${encodeURIComponent(val)}`);
    resultEl.innerHTML = '';
    loadFerretDetail(f.id);
  } catch (err) {
    if (err.message === 'unassigned' || err.message.includes('404') || err.message.includes('not found')) {
      resultEl.innerHTML = `
        <div class="alert alert-danger d-flex align-items-center gap-2 py-2 small mb-0">
          <i class="bi bi-exclamation-octagon-fill"></i>
          <div>No ferret is currently assigned to a chip ending in <code>${val}</code>.</div>
        </div>`;
    } else if (err.message.includes('Multiple active chips')) {
      resultEl.innerHTML = `
        <div class="alert alert-warning d-flex align-items-center gap-2 py-2 small mb-0">
          <i class="bi bi-exclamation-triangle-fill"></i>
          <div>${err.message}</div>
        </div>`;
    } else {
      resultEl.innerHTML = `<div class="alert alert-warning py-2 small mb-0">Error: ${err.message}</div>`;
    }
  }
}

async function toggleDashNfcScan() {
  if (_nfcActive) {
    _nfcActive = false;
    _nfcReader = null;
    document.getElementById('dashNfcScanBtn').innerHTML = '<i class="bi bi-broadcast me-1"></i>Start NFC Scan';
    document.getElementById('dashNfcScanBtn').classList.remove('btn-danger');
    document.getElementById('dashNfcScanBtn').classList.add('btn-outline-primary');
    document.getElementById('dashNfcScanStatus').textContent = '';
    return;
  }
  try {
    _nfcReader = new NDEFReader();
    await _nfcReader.scan();
    _nfcActive = true;
    document.getElementById('dashNfcScanBtn').innerHTML = '<i class="bi bi-stop-circle me-1"></i>Stop Scanning';
    document.getElementById('dashNfcScanBtn').classList.remove('btn-outline-primary');
    document.getElementById('dashNfcScanBtn').classList.add('btn-danger');
    document.getElementById('dashNfcScanStatus').innerHTML = '<span class="spinner-grow spinner-grow-sm text-danger me-1"></span>Scanning…';

    _nfcReader.addEventListener('reading', ({ serialNumber }) => {
      const rfid = (serialNumber || '').replace(/:/g, '').toUpperCase();
      if (!rfid) return;
      document.getElementById('dashRfidLookupInput').value = rfid;
      doDashRfidLookup(rfid);
      _nfcActive = false;
      _nfcReader = null;
      document.getElementById('dashNfcScanBtn').innerHTML = '<i class="bi bi-broadcast me-1"></i>Start NFC Scan';
      document.getElementById('dashNfcScanBtn').classList.remove('btn-danger');
      document.getElementById('dashNfcScanBtn').classList.add('btn-outline-primary');
      document.getElementById('dashNfcScanStatus').textContent = `Read: ${rfid}`;
    });

    _nfcReader.addEventListener('error', (e) => {
      document.getElementById('dashNfcScanStatus').textContent = 'NFC error: ' + e.message;
      _nfcActive = false;
    });
  } catch (err) {
    document.getElementById('dashNfcScanStatus').textContent = 'NFC unavailable: ' + err.message;
    _nfcActive = false;
  }
}

// ─── Distribution (ferret-level) ──────────────────────────────────────────────
async function openDistributeModal(ferretId, ferretName) {
  document.getElementById('distFerretId').value = ferretId;
  document.getElementById('distFerretName').textContent = `Distributing: ${ferretName}`;
  document.getElementById('distDate').value = today();
  document.getElementById('distPrice').value = '';
  document.getElementById('distNotes').value = '';
  try {
    const distributors = await api('/distributors');
    document.getElementById('distDistributorId').innerHTML =
      distributors.map(d => `<option value="${d.distributor_id}">${d.distributor_name}</option>`).join('');
    new bootstrap.Modal(document.getElementById('distributeModal')).show();
  } catch (err) { alert(err.message); }
}

async function submitDistribute() {
  const ferretId = document.getElementById('distFerretId').value;
  const distId = document.getElementById('distDistributorId').value;
  const date = document.getElementById('distDate').value;
  const price = document.getElementById('distPrice').value;
  const notes = document.getElementById('distNotes').value;
  if (!distId || !date) return alert('Distributor and date are required.');
  try {
    await api(`/ferrets/${ferretId}/distribute`, {
      method: 'POST',
      body: {
        distributor_id: parseInt(distId), distribution_date: date,
        price: price ? parseFloat(price) : null, notes: notes || null
      }
    });
    bootstrap.Modal.getInstance(document.getElementById('distributeModal')).hide();
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

async function undoDistribute(ferretId) {
  if (!confirm('Undo this distribution? The ferret will be returned to active status.')) return;
  try {
    await api(`/ferrets/${ferretId}/distribute/undo`, { method: 'PUT', body: {} });
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

function openTagDistModal(ferretId, ferretName) {
  document.getElementById('tagDistFerretId').value = ferretId;
  document.getElementById('tagDistFerretName').textContent = `Tag for distribution: ${ferretName}`;
  document.getElementById('tagDistKind').value = 'offsite';
  document.getElementById('tagDistDest').value = '';
  document.getElementById('tagDistDate').value = today();
  document.getElementById('tagDistNotes').value = '';
  new bootstrap.Modal(document.getElementById('tagDistModal')).show();
}

async function submitDistributionTag() {
  const ferretId = document.getElementById('tagDistFerretId').value;
  const tag = document.getElementById('tagDistKind').value;
  const dest = document.getElementById('tagDistDest').value.trim();
  const tagged_at = document.getElementById('tagDistDate').value;
  const notes = document.getElementById('tagDistNotes').value.trim();
  if (!tag || !tagged_at) return alert('Destination type and date are required.');
  try {
    await api(`/ferrets/${ferretId}/distribution-tag`, {
      method: 'PUT',
      body: { tag, dest: dest || null, tagged_at, notes: notes || null }
    });
    bootstrap.Modal.getInstance(document.getElementById('tagDistModal')).hide();
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

async function clearDistributionTag(ferretId) {
  if (!confirm('Clear the distribution tag? The ferret will return to the Active list.')) return;
  try {
    await api(`/ferrets/${ferretId}/distribution-tag`, { method: 'DELETE' });
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

// ─── Research (v2.1-beta.1) ───────────────────────────────────────────────────
async function openAssignResearchModal(ferretId, ferretName) {
  document.getElementById('resFerretId').value = ferretId;
  document.getElementById('resFerretName').textContent = `Assign to research: ${ferretName}`;
  document.getElementById('resAssignedDate').value = today();
  document.getElementById('resCohort').value = 'unassigned';
  document.getElementById('resNotes').value = '';
  try {
    const studies = await api('/research/studies');
    const active = studies.filter(s => s.status === 'active');
    const list = active.length ? active : studies;
    if (!list.length) {
      alert('Create a study on the Research page first.');
      return;
    }
    document.getElementById('resStudyId').innerHTML =
      list.map(s => `<option value="${s.study_id}">${s.study_name}${s.sponsor ? ' — ' + s.sponsor : ''}</option>`).join('');
    new bootstrap.Modal(document.getElementById('assignResearchModal')).show();
  } catch (err) { alert(err.message); }
}

async function submitAssignResearch() {
  const ferretId = document.getElementById('resFerretId').value;
  const studyId = document.getElementById('resStudyId').value;
  const date = document.getElementById('resAssignedDate').value;
  const cohort = document.getElementById('resCohort').value;
  const notes = document.getElementById('resNotes').value;
  if (!studyId || !date) return alert('Study and date are required.');
  try {
    await api(`/ferrets/${ferretId}/research`, {
      method: 'POST',
      body: { study_id: parseInt(studyId), assigned_date: date, cohort, notes: notes || null }
    });
    bootstrap.Modal.getInstance(document.getElementById('assignResearchModal')).hide();
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

function openEndResearchModal(ferretId, ferretName) {
  document.getElementById('endResFerretId').value = ferretId;
  document.getElementById('endResFerretName').textContent = `End research: ${ferretName}`;
  document.getElementById('endResDate').value = today();
  document.getElementById('endResOutcome').value = 'reintegrated';
  document.getElementById('endResNotes').value = '';
  new bootstrap.Modal(document.getElementById('endResearchModal')).show();
}

async function submitEndResearch() {
  const ferretId = document.getElementById('endResFerretId').value;
  const outcome = document.getElementById('endResOutcome').value;
  const date = document.getElementById('endResDate').value;
  const notes = document.getElementById('endResNotes').value;
  if (!outcome || !date) return alert('Outcome and date are required.');
  try {
    await api(`/ferrets/${ferretId}/research/end`, {
      method: 'PUT',
      body: { outcome, ended_date: date, notes: notes || null }
    });
    bootstrap.Modal.getInstance(document.getElementById('endResearchModal')).hide();
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

async function loadResearchPage() {
  const studyBox = document.getElementById('researchStudyCards');
  const table = document.getElementById('researchAssignTable');
  if (!studyBox || !table) return;
  const addBtn = document.getElementById('btnAddStudy');
  if (addBtn) addBtn.classList.toggle('d-none', !canUpdate());
  try {
    const [studies, assignments] = await Promise.all([
      api('/research/studies'),
      api('/research/assignments?open=1')
    ]);
    if (!studies.length) {
      studyBox.innerHTML = '<div class="col"><p class="text-muted">No studies yet. Create one to assign ferrets.</p></div>';
    } else {
      studyBox.innerHTML = studies.map(s => `
        <div class="col-md-6 col-lg-4">
          <div class="card h-100">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <h6 class="fw-semibold mb-1">${s.study_name}</h6>
                <span class="badge ${s.status === 'active' ? 'bg-success' : 'bg-secondary'}">${s.status}</span>
              </div>
              <div class="text-muted small">${s.sponsor || 'No sponsor listed'}</div>
              <div class="small mt-2">${s.open_count || 0} on study · ${s.assignment_count || 0} total assigned</div>
              ${s.start_date ? `<div class="text-muted small">Started ${String(s.start_date).slice(0, 10)}</div>` : ''}
              ${s.notes ? `<div class="small mt-2">${s.notes}</div>` : ''}
              ${canUpdate() ? `<button class="btn btn-sm btn-outline-secondary mt-2" onclick="openStudyModal(${s.study_id})">Edit</button>` : ''}
            </div>
          </div>
        </div>`).join('');
    }
    window._researchStudies = studies;
    if (!assignments.length) {
      table.innerHTML = '<tr><td colspan="8" class="text-muted text-center py-4">No ferrets currently on research.</td></tr>';
      return;
    }
    table.innerHTML = assignments.map(a => `
      <tr style="cursor:pointer" onclick="loadFerretDetail(${a.ferret_id})">
        <td>${a.ferret_name}</td>
        <td>${a.animal_id || '—'}</td>
        <td>${a.study_name}</td>
        <td>${a.cohort || '—'}</td>
        <td>${String(a.assigned_date).slice(0, 10)}</td>
        <td>${a.room_name || a.room_id || '—'}${a.cage_address ? ' · ' + a.cage_address : ''}</td>
        <td>${a.sponsor || '—'}</td>
        <td>${a.sex || '—'}</td>
      </tr>`).join('');
  } catch (err) {
    studyBox.innerHTML = `<div class="col"><p class="text-danger">${err.message}</p></div>`;
    table.innerHTML = `<tr><td colspan="8" class="text-danger">${err.message}</td></tr>`;
  }
}

function openStudyModal(studyId) {
  const s = (window._researchStudies || []).find(x => x.study_id === studyId);
  document.getElementById('studyId').value = studyId || '';
  document.getElementById('studyName').value = s?.study_name || '';
  document.getElementById('studySponsor').value = s?.sponsor || '';
  document.getElementById('studyStart').value = s?.start_date ? String(s.start_date).slice(0, 10) : today();
  document.getElementById('studyEnd').value = s?.planned_end_date ? String(s.planned_end_date).slice(0, 10) : '';
  document.getElementById('studyStatus').value = s?.status || 'active';
  document.getElementById('studyNotes').value = s?.notes || '';
  document.getElementById('studyModalTitle').textContent = studyId ? 'Edit Study' : 'New Study';
  new bootstrap.Modal(document.getElementById('studyModal')).show();
}

async function submitStudy() {
  const id = document.getElementById('studyId').value;
  const body = {
    study_name: document.getElementById('studyName').value.trim(),
    sponsor: document.getElementById('studySponsor').value.trim() || null,
    start_date: document.getElementById('studyStart').value || null,
    planned_end_date: document.getElementById('studyEnd').value || null,
    status: document.getElementById('studyStatus').value,
    notes: document.getElementById('studyNotes').value.trim() || null
  };
  if (!body.study_name) return alert('Study name is required.');
  try {
    if (id) await api(`/research/studies/${id}`, { method: 'PUT', body });
    else await api('/research/studies', { method: 'POST', body });
    bootstrap.Modal.getInstance(document.getElementById('studyModal')).hide();
    loadResearchPage();
  } catch (err) { alert(err.message); }
}

async function loadFerretDistHistory(ferretId) {
  const el = document.getElementById('distFerretHistory');
  if (!el) return;
  try {
    const events = await api(`/ferrets/${ferretId}/distribution`);
    if (!events.length) {
      el.innerHTML = '<p class="text-muted small">This ferret has no distribution records.</p>';
      return;
    }
    el.innerHTML = `
      <table class="table table-sm">
        <thead><tr><th>Date</th><th>Distributor</th><th>Price</th><th>Notes</th><th>Recorded By</th></tr></thead>
        <tbody>
          ${events.map(e => `
            <tr>
              <td>${fmtDate(e.distribution_date)}</td>
              <td><strong>${e.distributor_name}</strong><br><span class="text-muted small">${e.distributor_address || ''}</span></td>
              <td>${e.price != null ? '$' + parseFloat(e.price).toFixed(2) : '—'}</td>
              <td class="small">${e.notes || '—'}</td>
              <td class="text-muted small">${e.recorded_by || '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    el.innerHTML = '<div class="text-danger small">Failed to load distribution records.</div>';
  }
}

// ─── Light Cycle (per-ferret; follows the animal, not the room) ────────────────
function toggleLightCycleEdit() {
  const row = document.getElementById('lightCycleEditRow');
  if (!row) return;
  const showing = row.style.display !== 'none';
  row.style.display = showing ? 'none' : '';
  if (!showing) document.getElementById('lcManualSince').value = today();
}

async function saveLightCycle(ferretId) {
  try {
    const eight_hour_light = document.getElementById('lcManualValue').value === '1';
    const light_state_since = document.getElementById('lcManualSince').value;
    if (!light_state_since) return alert('Please choose a since-date.');
    await api(`/ferrets/${ferretId}/light-cycle`, {
      method: 'PUT',
      body: { light_mode: 'manual', eight_hour_light, light_state_since }
    });
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

async function toggleBreedingRetired(ferretId, enabled) {
  try {
    await api(`/ferrets/${ferretId}/breeding-retired`, { method: 'PUT', body: { breeding_retired: enabled } });
    loadFerretDetail(ferretId);
  } catch (err) {
    alert(err.message);
    const toggle = document.getElementById('breedingRetiredToggle');
    if (toggle) toggle.checked = !enabled;
  }
}

// ─── Photo ────────────────────────────────────────────────────────────────────
// Android's native camera intent often kills the Chrome tab. In-page
// getUserMedia + client-side JPEG compress keeps the SPA alive and stays
// under the server size limit. Native file/camera inputs remain as fallback.

let _pendingPhotoFile = null;
let _cameraStream = null;
let _photoPreparing = false;

function stopCameraStream() {
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(t => t.stop());
    _cameraStream = null;
  }
  const video = document.getElementById('photoCameraVideo');
  if (video) video.srcObject = null;
}

function setPhotoPreview(previewId, file) {
  const box = document.getElementById(previewId);
  if (!box) return;
  const url = URL.createObjectURL(file);
  box.innerHTML = `<img src="${url}" alt="Preview" style="max-height:180px;max-width:100%;border-radius:8px">`;
}

async function compressImageFile(file, maxDim = 1600, quality = 0.82) {
  if (!file) throw new Error('No photo selected.');
  const toJpegFile = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error('Could not process image'));
      const base = (file.name && file.name.includes('.'))
        ? file.name.replace(/\.[^.]+$/, '')
        : 'photo';
      resolve(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', quality);
  });
  const fit = (srcW, srcH) => {
    let w = srcW, h = srcH;
    if (w > maxDim || h > maxDim) {
      if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
      else { w = Math.round(w * maxDim / h); h = maxDim; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, w);
    canvas.height = Math.max(1, h);
    return canvas;
  };

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const canvas = fit(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      if (bitmap.close) bitmap.close();
      return await toJpegFile(canvas);
    } catch (_) { /* fall through to Image() */ }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      try {
        const canvas = fit(img.naturalWidth, img.naturalHeight);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(await toJpegFile(canvas));
      } catch (err) { reject(err); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that photo. Use Take Photo, or pick a JPEG/PNG.'));
    };
    img.src = url;
  });
}

async function previewPhoto(input, previewId) {
  const file = input.files[0];
  if (!file) return;
  _photoPreparing = true;
  try {
    const compact = await compressImageFile(file);
    try {
      const dt = new DataTransfer();
      dt.items.add(compact);
      input.files = dt.files;
    } catch (_) { /* DataTransfer may be missing in older WebViews */ }
    _pendingPhotoFile = compact;
    setPhotoPreview(previewId, compact);
  } catch (err) {
    _pendingPhotoFile = null;
    input.value = '';
    const box = document.getElementById(previewId);
    if (box) box.innerHTML = '';
    alert(err.message || 'Could not read that photo.');
  } finally {
    _photoPreparing = false;
  }
}

function openPhotoModal(ferretId) {
  document.getElementById('photoFerretId').value = ferretId;
  document.getElementById('photoPreviewBox').innerHTML = '';
  document.getElementById('photoFileInput').value = '';
  document.getElementById('photoCameraInput').value = '';
  _pendingPhotoFile = null;
  stopCameraStream();
  const camBox = document.getElementById('photoCameraBox');
  if (camBox) camBox.classList.add('d-none');
  const modalEl = document.getElementById('photoModal');
  modalEl.removeEventListener('hidden.bs.modal', onPhotoModalHidden);
  modalEl.addEventListener('hidden.bs.modal', onPhotoModalHidden);
  new bootstrap.Modal(modalEl).show();
}

function onPhotoModalHidden() {
  stopCameraStream();
  _pendingPhotoFile = null;
  try { sessionStorage.removeItem('sb_photo_pending'); } catch (_) {}
}

function pickPhotoFile() {
  const id = document.getElementById('photoFerretId').value;
  try {
    if (id) sessionStorage.setItem('sb_photo_pending', String(id));
  } catch (_) {}
  document.getElementById('photoFileInput').click();
}

async function startPhotoCamera() {
  const id = document.getElementById('photoFerretId').value;
  try {
    if (id) sessionStorage.setItem('sb_photo_pending', String(id));
  } catch (_) {}
  stopCameraStream();
  const camBox = document.getElementById('photoCameraBox');
  const video = document.getElementById('photoCameraVideo');
  const canLive = navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    && (window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  if (!canLive) {
    // getUserMedia is blocked on plain HTTP. Do not force capture="environment" —
    // that hands the phone to the camera app and often kills this page.
    document.getElementById('photoFileInput').click();
    return;
  }
  try {
    _cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = _cameraStream;
    await video.play().catch(() => {});
    camBox.classList.remove('d-none');
    document.getElementById('photoPreviewBox').innerHTML = '';
    _pendingPhotoFile = null;
  } catch (err) {
    console.warn('In-page camera unavailable, falling back to file picker', err);
    camBox.classList.add('d-none');
    document.getElementById('photoFileInput').click();
  }
}

function capturePhotoFrame() {
  const video = document.getElementById('photoCameraVideo');
  if (!video || !video.videoWidth) return alert('Camera is not ready yet. Wait a moment and try again.');
  const maxDim = 1600;
  let w = video.videoWidth, h = video.videoHeight;
  if (w > maxDim || h > maxDim) {
    if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
    else { w = Math.round(w * maxDim / h); h = maxDim; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(blob => {
    if (!blob) return alert('Could not capture photo.');
    _pendingPhotoFile = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
    setPhotoPreview('photoPreviewBox', _pendingPhotoFile);
    document.getElementById('photoCameraBox').classList.add('d-none');
    stopCameraStream();
    try { sessionStorage.removeItem('sb_photo_pending'); } catch (_) {}
  }, 'image/jpeg', 0.85);
}

async function submitPhoto() {
  if (_photoPreparing) return alert('Photo is still processing. Try again in a second.');
  const ferretId = document.getElementById('photoFerretId').value;
  const file = _pendingPhotoFile
    || document.getElementById('photoCameraInput').files[0]
    || document.getElementById('photoFileInput').files[0];
  if (!file) return alert('Please take or select a photo first.');
  const fd = new FormData();
  fd.append('photo', file, file.name || 'photo.jpg');
  try {
    await apiUpload(`/ferrets/${ferretId}/photo`, fd);
    try { sessionStorage.removeItem('sb_photo_pending'); } catch (_) {}
    const inst = bootstrap.Modal.getInstance(document.getElementById('photoModal'));
    if (inst) inst.hide();
    stopCameraStream();
    _pendingPhotoFile = null;
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

// ─── Ferret Actions ───────────────────────────────────────────────────────────
async function saveFerretName(id) {
  if (!roleIs('admin')) return alert('Only an admin can change a ferret name.');
  const val = document.getElementById('editFerretName').value.trim();
  if (!val) return alert('Ferret name cannot be empty.');
  if (val.length > 45) return alert('Name is too long (max 45 characters).');
  try {
    await api(`/ferrets/${id}`, { method: 'PUT', body: { ferret_name: val } });
    loadFerretDetail(id);
  } catch (err) { alert(err.message); }
}

async function saveDescription(id) {
  const val = document.getElementById('editDescription').value;
  try {
    await api(`/ferrets/${id}`, { method: 'PUT', body: { description: val || null } });
    loadFerretDetail(id);
  } catch (err) { alert(err.message); }
}

async function saveColor(id) {
  const val = document.getElementById('editColor').value.trim();
  try {
    await api(`/ferrets/${id}`, { method: 'PUT', body: { color: val || null } });
    loadFerretDetail(id);
  } catch (err) { alert(err.message); }
}

async function saveBirthDate(id) {
  const val = document.getElementById('editBirthDate').value;
  if (!val) return alert('Please enter a valid date.');
  try {
    await api(`/ferrets/${id}`, { method: 'PUT', body: { birth_date: val } });
    loadFerretDetail(id);
  } catch (err) { alert(err.message); }
}

async function saveDeathDate(id) {
  const val = document.getElementById('editDeathDate').value;
  if (!val) return alert('Please enter a date of death.');
  try {
    await api(`/ferrets/${id}/death`, { method: 'PUT', body: { death_date: val } });
    loadFerretDetail(id);
  } catch (err) { alert(err.message); }
}

function ynuLabel(v) {
  if (v === 'yes') return 'Yes';
  if (v === 'no') return 'No';
  if (v === 'na') return 'N/A';
  return 'Unknown';
}

function deathPersonLabel(row, fallbackEmail) {
  return row.recorded_by_name || row.recorded_by_username || row.created_by_name || row.created_by_username
    || row.uploaded_by_name || row.uploaded_by_username
    || row.recorded_by_email || row.created_by_email || fallbackEmail || 'Unknown';
}

function renderDeathLogSection(id, f, death) {
  const canEditDeath = canUpdate();
  const notes = (death && death.notes) || [];
  const photos = (death && death.photos) || [];
  window._deathNotesById = {};
  notes.forEach(n => { window._deathNotesById[n.note_id] = n; });
  const recordedWhen = death && death.recorded_at ? String(death.recorded_at).replace('T', ' ').slice(0, 16) : '';
  const recordedBy = death ? deathPersonLabel(death, death.recorded_by_email) : '';
  return `
      <div class="border rounded p-3 mb-3" style="background:var(--bs-tertiary-bg, #f8f9fa)">
        <div class="d-flex align-items-center flex-wrap gap-2 mb-2">
          <h6 class="fw-semibold text-muted small text-uppercase mb-0">Death Log</h6>
          ${canEditDeath ? `
          <button class="btn btn-sm btn-outline-secondary ms-auto" onclick="openEditDeathModal(${id})"><i class="bi bi-pencil me-1"></i>Edit</button>
          <button class="btn btn-sm btn-outline-primary" onclick="openDeathNoteModal(${id})"><i class="bi bi-journal-plus me-1"></i>Add Necropsy / Note</button>
          <button class="btn btn-sm btn-outline-primary" onclick="openDeathPhotoModal(${id})"><i class="bi bi-camera me-1"></i>Add Photo</button>
          ` : ''}
        </div>
        <div class="row g-3 mb-2">
          <div class="col-md-4"><span class="text-muted small d-block">Food / water access</span>
            <strong>${ynuLabel(death && death.food_water_access)}</strong></div>
          <div class="col-md-4"><span class="text-muted small d-block">Cage mates</span>
            <strong>${ynuLabel(death && death.cage_mates_present)}</strong></div>
          <div class="col-md-4"><span class="text-muted small d-block">Cage mates healthy</span>
            <strong>${ynuLabel(death && death.cage_mates_healthy)}</strong></div>
          <div class="col-md-8"><span class="text-muted small d-block">Recorded by</span>
            <strong>${recordedBy || '—'}</strong>
            ${recordedWhen ? `<span class="text-muted small"> · ${recordedWhen}</span>` : ''}</div>
          ${death && death.cause_detail && death.cause_detail !== death.cause_of_death ? `
          <div class="col-md-4"><span class="text-muted small d-block">Original cause text</span>
            <strong>${death.cause_detail}</strong></div>` : ''}
        </div>
        <h6 class="fw-semibold text-muted small text-uppercase mb-2 mt-3">Notes</h6>
        ${notes.length ? notes.map(n => `
          <div class="border rounded p-3 bg-white mb-2">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
              <span class="badge ${n.note_type === 'necropsy' ? 'bg-dark' : 'bg-secondary'}">${n.note_type === 'necropsy' ? 'Necropsy' : 'Death'}</span>
              <span class="text-muted small">${deathNoteWhen(n)}</span>
              <span class="text-muted small">By: ${deathNoteWho(n)}</span>
              ${canEditDeath ? `<button class="btn btn-sm btn-outline-secondary ms-auto py-0" onclick="openDeathNoteModal(${id}, _deathNotesById[${n.note_id}])"><i class="bi bi-pencil"></i></button>` : ''}
            </div>
            <div class="small" style="white-space:pre-wrap;line-height:1.6">${n.notes || ''}</div>
          </div>`).join('') : `<p class="text-muted small mb-2">No notes yet. Necropsy findings can be added after the death is recorded.</p>`}
        <h6 class="fw-semibold text-muted small text-uppercase mb-2 mt-3">Photos</h6>
        ${photos.length ? `
        <div class="d-flex flex-wrap gap-2">
          ${photos.map(p => `
            <div class="position-relative">
              <a href="${p.photo_original_url || p.photo_url}" target="_blank" rel="noopener">
                <img src="${p.photo_url}" alt="${p.kind}" class="rounded border" style="width:120px;height:120px;object-fit:cover">
              </a>
              <span class="badge ${p.kind === 'necropsy' ? 'bg-dark' : 'bg-secondary'} position-absolute top-0 start-0 m-1">${p.kind === 'necropsy' ? 'Necropsy' : 'Death'}</span>
              ${canEditDeath ? `<button class="btn btn-sm btn-danger position-absolute top-0 end-0 m-1 py-0 px-1" onclick="deleteDeathPhoto(${id},${p.photo_id})" title="Remove"><i class="bi bi-x"></i></button>` : ''}
            </div>`).join('')}
        </div>` : `<p class="text-muted small mb-0">No photos attached.</p>`}
      </div>
      <hr class="my-3">`;
}

async function saveSex(id) {
  const val = document.getElementById('editSex').value;
  try {
    await api(`/ferrets/${id}`, { method: 'PUT', body: { sex: val || null } });
    loadFerretDetail(id);
  } catch (err) { alert(err.message); }
}

function onCageMatesChange(prefix) {
  const present = document.getElementById(prefix === 'editDeath' ? 'editDeathCageMates' : 'deceasedCageMates').value;
  const healthy = document.getElementById(prefix === 'editDeath' ? 'editDeathCageHealthy' : 'deceasedCageHealthy');
  if (!healthy) return;
  if (present === 'no') healthy.value = 'na';
  else if (healthy.value === 'na') healthy.value = 'unknown';
}

function previewDeathFiles(input, previewId) {
  const box = document.getElementById(previewId);
  if (!box) return;
  box.innerHTML = '';
  const files = Array.from(input.files || []);
  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = document.createElement('img');
    img.src = url;
    img.alt = file.name;
    img.className = 'rounded border';
    img.style.cssText = 'width:88px;height:88px;object-fit:cover';
    box.appendChild(img);
  });
}

function openDeceasedModal(ferretId) {
  document.getElementById('deceasedFerretId').value = ferretId;
  document.getElementById('deceasedDate').value = today();
  document.getElementById('deceasedCause').value = '';
  document.getElementById('deceasedFoodWater').value = 'unknown';
  document.getElementById('deceasedCageMates').value = 'unknown';
  document.getElementById('deceasedCageHealthy').value = 'unknown';
  document.getElementById('deceasedNotes').value = '';
  const photos = document.getElementById('deceasedPhotos');
  if (photos) photos.value = '';
  const preview = document.getElementById('deceasedPhotoPreview');
  if (preview) preview.innerHTML = '';
  new bootstrap.Modal(document.getElementById('deceasedModal')).show();
}

async function submitMarkDeceased() {
  const id = document.getElementById('deceasedFerretId').value;
  const death_date = document.getElementById('deceasedDate').value;
  const cause_of_death = document.getElementById('deceasedCause').value;
  if (!death_date) return alert('Please enter a date of death.');
  if (!cause_of_death) return alert('Cause of death is required.');
  try {
    await api(`/ferrets/${id}/deceased`, {
      method: 'PUT',
      body: {
        death_date,
        cause_of_death,
        food_water_access: document.getElementById('deceasedFoodWater').value,
        cage_mates_present: document.getElementById('deceasedCageMates').value,
        cage_mates_healthy: document.getElementById('deceasedCageHealthy').value,
        notes: document.getElementById('deceasedNotes').value.trim() || null
      }
    });
    const files = Array.from(document.getElementById('deceasedPhotos').files || []);
    for (const file of files) {
      try {
        const compact = await compressImageFile(file);
        const fd = new FormData();
        fd.append('photo', compact, compact.name || 'photo.jpg');
        fd.append('kind', 'death');
        await apiUpload(`/ferrets/${id}/death/photos`, fd);
      } catch (photoErr) {
        console.warn('Death photo upload failed', photoErr);
      }
    }
    bootstrap.Modal.getInstance(document.getElementById('deceasedModal')).hide();
    loadFerretDetail(id);
  } catch (err) { alert(err.message); }
}

function openEditDeathModal(ferretId) {
  document.getElementById('editDeathFerretId').value = ferretId;
  api(`/ferrets/${ferretId}/death`).then(death => {
    document.getElementById('editDeathDateField').value = death.death_date ? String(death.death_date).slice(0, 10) : '';
    document.getElementById('editDeathCause').value = death.cause_of_death || 'Unknown';
    document.getElementById('editDeathFoodWater').value = death.food_water_access || 'unknown';
    document.getElementById('editDeathCageMates').value = death.cage_mates_present || 'unknown';
    document.getElementById('editDeathCageHealthy').value = death.cage_mates_healthy || 'unknown';
    new bootstrap.Modal(document.getElementById('editDeathModal')).show();
  }).catch(err => alert(err.message));
}

async function submitEditDeath() {
  const id = document.getElementById('editDeathFerretId').value;
  const death_date = document.getElementById('editDeathDateField').value;
  const cause_of_death = document.getElementById('editDeathCause').value;
  if (!death_date) return alert('Date of death is required.');
  if (!cause_of_death) return alert('Cause of death is required.');
  try {
    await api(`/ferrets/${id}/death`, {
      method: 'PUT',
      body: {
        death_date,
        cause_of_death,
        food_water_access: document.getElementById('editDeathFoodWater').value,
        cage_mates_present: document.getElementById('editDeathCageMates').value,
        cage_mates_healthy: document.getElementById('editDeathCageHealthy').value
      }
    });
    bootstrap.Modal.getInstance(document.getElementById('editDeathModal')).hide();
    loadFerretDetail(id);
  } catch (err) { alert(err.message); }
}

async function toggleCareNeed(ferretId, kind, checked) {
  try {
    const body = kind === 'nail' ? { nail: !!checked } : { bath: !!checked };
    await api(`/ferrets/${ferretId}/care-need`, { method: 'PUT', body });
    if (typeof loadDashCareAlerts === 'function') loadDashCareAlerts();
  } catch (err) {
    alert(err.message);
    if (typeof loadFerrets === 'function') loadFerrets();
    else if (_currentFerretId) loadFerretDetail(_currentFerretId);
  }
}

function deathNoteWhen(n) {
  const raw = n.performed_at || n.created_at;
  return raw ? String(raw).replace('T', ' ').slice(0, 16) : '';
}

function deathNoteWho(n) {
  return n.performed_by || deathPersonLabel(n, n.created_by_email);
}

function toDatetimeLocalValue(raw) {
  if (!raw) {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  const s = String(raw).replace(' ', 'T');
  return s.slice(0, 16);
}

async function fillDeathNoteWhoList(selected) {
  const input = document.getElementById('deathNoteWho');
  const list = document.getElementById('deathNoteWhoList');
  if (!input) return;
  const fallback = (typeof USER !== 'undefined' && USER) ? (USER.full_name || USER.username || '') : '';
  input.value = selected || fallback;
  if (!list) return;
  try {
    const users = await api('/users/names');
    list.innerHTML = (users || []).map(u => {
      const label = u.full_name ? (u.full_name + ' (' + u.username + ')') : u.username;
      return '<option value="' + String(label).replace(/"/g, '&quot;') + '"></option>';
    }).join('');
  } catch (_) {
    list.innerHTML = fallback ? '<option value="' + String(fallback).replace(/"/g, '&quot;') + '"></option>' : '';
  }
}

function openDeathNoteModal(ferretId, note) {
  document.getElementById('deathNoteFerretId').value = ferretId;
  document.getElementById('deathNoteId').value = note && note.note_id ? note.note_id : '';
  document.getElementById('deathNoteType').value = (note && note.note_type) || 'necropsy';
  document.getElementById('deathNoteText').value = (note && note.notes) || '';
  document.getElementById('deathNoteWhen').value = toDatetimeLocalValue(note && (note.performed_at || note.created_at));
  const title = document.querySelector('#deathNoteModal .modal-title');
  if (title) title.innerHTML = note
    ? '<i class="bi bi-pencil me-2"></i>Edit Note'
    : '<i class="bi bi-journal-plus me-2"></i>Add Note';
  fillDeathNoteWhoList(note && note.performed_by);
  new bootstrap.Modal(document.getElementById('deathNoteModal')).show();
}

async function submitDeathNote() {
  const id = document.getElementById('deathNoteFerretId').value;
  const noteId = document.getElementById('deathNoteId').value;
  const notes = document.getElementById('deathNoteText').value.trim();
  if (!notes) return alert('Notes are required.');
  const body = {
    note_type: document.getElementById('deathNoteType').value,
    notes,
    performed_at: document.getElementById('deathNoteWhen').value || null,
    performed_by: document.getElementById('deathNoteWho').value.trim() || null
  };
  try {
    if (noteId) await api(`/ferrets/${id}/death/notes/${noteId}`, { method: 'PUT', body });
    else await api(`/ferrets/${id}/death/notes`, { method: 'POST', body });
    bootstrap.Modal.getInstance(document.getElementById('deathNoteModal')).hide();
    loadFerretDetail(id);
  } catch (err) { alert(err.message); }
}

let _pendingDeathPhotoFiles = [];
let _deathCameraStream = null;
const DEATH_PHOTO_MAX = 12;

function stopDeathCameraStream() {
  if (_deathCameraStream) {
    _deathCameraStream.getTracks().forEach(t => t.stop());
    _deathCameraStream = null;
  }
  const video = document.getElementById('deathPhotoCameraVideo');
  if (video) video.srcObject = null;
}

function openDeathPhotoModal(ferretId) {
  document.getElementById('deathPhotoFerretId').value = ferretId;
  document.getElementById('deathPhotoKind').value = 'necropsy';
  document.getElementById('deathPhotoPreviewBox').innerHTML = '';
  document.getElementById('deathPhotoFileInput').value = '';
  _pendingDeathPhotoFiles = [];
  stopDeathCameraStream();
  const camBox = document.getElementById('deathPhotoCameraBox');
  if (camBox) camBox.classList.add('d-none');
  const modalEl = document.getElementById('deathPhotoModal');
  modalEl.removeEventListener('hidden.bs.modal', onDeathPhotoModalHidden);
  modalEl.addEventListener('hidden.bs.modal', onDeathPhotoModalHidden);
  new bootstrap.Modal(modalEl).show();
}

function onDeathPhotoModalHidden() {
  stopDeathCameraStream();
  _pendingDeathPhotoFiles = [];
}

function renderDeathPhotoPreviews() {
  const box = document.getElementById('deathPhotoPreviewBox');
  if (!box) return;
  if (!_pendingDeathPhotoFiles.length) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = '<div class="d-flex flex-wrap gap-2 justify-content-center">' +
    _pendingDeathPhotoFiles.map((file, i) =>
      '<div class="position-relative">' +
      '<img src="' + URL.createObjectURL(file) + '" alt="" class="rounded border" style="width:88px;height:88px;object-fit:cover">' +
      '<button type="button" class="btn btn-sm btn-danger position-absolute top-0 end-0 py-0 px-1" onclick="removeDeathPhotoFile(' + i + ')"><i class="bi bi-x"></i></button>' +
      '</div>'
    ).join('') +
    '</div><div class="text-muted small mt-1">' + _pendingDeathPhotoFiles.length + ' photo' +
    (_pendingDeathPhotoFiles.length === 1 ? '' : 's') + ' ready</div>';
}

function removeDeathPhotoFile(idx) {
  _pendingDeathPhotoFiles.splice(idx, 1);
  renderDeathPhotoPreviews();
}

async function previewDeathPhotoFiles(input) {
  const incoming = Array.from(input.files || []);
  if (!incoming.length) return;
  const room = DEATH_PHOTO_MAX - _pendingDeathPhotoFiles.length;
  if (room <= 0) return alert('You can attach up to ' + DEATH_PHOTO_MAX + ' photos at a time.');
  const take = incoming.slice(0, room);
  for (const file of take) {
    try {
      _pendingDeathPhotoFiles.push(await compressImageFile(file));
    } catch (err) {
      alert(err.message);
    }
  }
  if (incoming.length > room) alert('Only the first ' + room + ' additional photo(s) were added (max ' + DEATH_PHOTO_MAX + ').');
  renderDeathPhotoPreviews();
}

function pickDeathPhotoFile() {
  document.getElementById('deathPhotoFileInput').click();
}

async function startDeathPhotoCamera() {
  stopDeathCameraStream();
  const camBox = document.getElementById('deathPhotoCameraBox');
  const video = document.getElementById('deathPhotoCameraVideo');
  const canLive = navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    && (window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  if (!canLive) {
    document.getElementById('deathPhotoFileInput').click();
    return;
  }
  try {
    _deathCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = _deathCameraStream;
    await video.play().catch(() => {});
    camBox.classList.remove('d-none');
  } catch (err) {
    console.warn('In-page camera unavailable, falling back to file picker', err);
    camBox.classList.add('d-none');
    document.getElementById('deathPhotoFileInput').click();
  }
}

function captureDeathPhotoFrame() {
  const video = document.getElementById('deathPhotoCameraVideo');
  if (!video || !video.videoWidth) return alert('Camera is not ready yet. Wait a moment and try again.');
  const maxDim = 1600;
  let w = video.videoWidth, h = video.videoHeight;
  if (w > maxDim || h > maxDim) {
    if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
    else { w = Math.round(w * maxDim / h); h = maxDim; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(blob => {
    if (!blob) return alert('Could not capture photo.');
    if (_pendingDeathPhotoFiles.length >= DEATH_PHOTO_MAX) {
      return alert('You can attach up to ' + DEATH_PHOTO_MAX + ' photos at a time.');
    }
    _pendingDeathPhotoFiles.push(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
    renderDeathPhotoPreviews();
    document.getElementById('deathPhotoCameraBox').classList.add('d-none');
    stopDeathCameraStream();
  }, 'image/jpeg', 0.85);
}

async function submitDeathPhoto() {
  const ferretId = document.getElementById('deathPhotoFerretId').value;
  const files = _pendingDeathPhotoFiles.slice();
  if (!files.length) return alert('Please take or select a photo first.');
  const kind = document.getElementById('deathPhotoKind').value;
  try {
    for (const file of files) {
      const fd = new FormData();
      fd.append('photo', file, file.name || 'photo.jpg');
      fd.append('kind', kind);
      await apiUpload(`/ferrets/${ferretId}/death/photos`, fd);
    }
    const inst = bootstrap.Modal.getInstance(document.getElementById('deathPhotoModal'));
    if (inst) inst.hide();
    stopDeathCameraStream();
    _pendingDeathPhotoFiles = [];
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

async function deleteDeathPhoto(ferretId, photoId) {
  if (!confirm('Remove this photo?')) return;
  try {
    await api(`/ferrets/${ferretId}/death/photos/${photoId}`, { method: 'DELETE' });
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

async function toggleDead(id, current) {
  if (!confirm('Mark this ferret as active? This will clear the deceased status.')) return;
  try {
    await api(`/ferrets/${id}`, { method: 'PUT', body: { dead: '0', death_date: null } });
    loadFerretDetail(id);
  } catch (err) { alert(err.message); }
}

async function archiveFerret(id, name) {
  const label = name || 'this ferret';
  if (!confirm(`Move ${label} to the archive?\n\nThey will leave Active / Research / Distributed lists. An admin can restore or permanently delete after review.`)) return;
  try {
    await api(`/ferrets/${id}/archive`, { method: 'POST' });
    nav('ferrets');
  } catch (err) { alert(err.message); }
}

async function restoreFerret(id, name) {
  const label = name || 'this ferret';
  if (!confirm(`Restore ${label} from the archive?\n\nThey will return to the list that matches their current status.`)) return;
  try {
    await api(`/ferrets/${id}/restore`, { method: 'POST' });
    loadFerretDetail(id);
  } catch (err) { alert(err.message); }
}

async function purgeFerret(id, name) {
  const label = name || 'this ferret';
  if (!confirm(`PERMANENTLY delete ${label} and all related records (health, litters as mother, vaccinations, research assignments, location history)?\n\nThis cannot be undone.`)) return;
  const typed = prompt(`Type the ferret's name exactly to confirm permanent delete:\n\n${label}`);
  if (typed == null) return;
  if (typed.trim() !== label) {
    alert('Name did not match. Permanent delete cancelled.');
    return;
  }
  try {
    await api(`/ferrets/${id}`, { method: 'DELETE' });
    nav('ferrets');
  } catch (err) { alert(err.message); }
}

// ─── Add Ferret Modal ─────────────────────────────────────────────────────────
async function openFerretModal() {
  try {
    const [addresses, suppliers] = await Promise.all([api('/addresses'), api('/suppliers')]);
    document.getElementById('fAddrId').innerHTML =
      '<option value="">— Unassigned —</option>' +
      addresses.map(a => `<option value="${a.address_id}">Room ${a.room_id}${a.room_name ? ' ' + a.room_name : ''} · ${a.cage_address || '?'}${a.room_lighting ? ' · ' + a.room_lighting : ''}</option>`).join('');
    document.getElementById('fSupplierId').innerHTML =
      '<option value="">— Unknown —</option>' +
      suppliers.map(s => `<option value="${s.supplier_id}">${s.supplier_name}</option>`).join('');
    ['fName', 'fDesc', 'fColor', 'fMother', 'fFather', 'fAcqBy'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('fBirthDate').value = today();
    document.getElementById('fWeight').value = '0';
    document.getElementById('fVaccine').value = '';
    document.getElementById('fSex').value = '';
    document.getElementById('fSpayed').value = 'n';
    document.getElementById('fSpayDate').value = '';
    document.getElementById('fSpayDateRow').style.display = 'none';
    document.getElementById('fPhotoPreview').innerHTML = '';
    document.getElementById('fPhotoFile').value = '';
    document.getElementById('fSpayed').onchange = function () {
      document.getElementById('fSpayDateRow').style.display = this.value === 'y' ? '' : 'none';
    };
    new bootstrap.Modal(document.getElementById('ferretModal')).show();
  } catch (err) { alert(err.message); }
}

async function submitFerret() {
  const name = document.getElementById('fName').value.trim();
  const bd = document.getElementById('fBirthDate').value;
  if (!name || !bd) return alert('Name and birth date are required.');
  try {
    const r = await api('/ferrets', {
      method: 'POST', body: {
        ferret_name: name,
        birth_date: bd,
        weight: parseInt(document.getElementById('fWeight').value) || 0,
        description: document.getElementById('fDesc').value || null,
        color: document.getElementById('fColor').value.trim() || null,
        address_id: document.getElementById('fAddrId').value || null,
        supplier_id: document.getElementById('fSupplierId').value || null,
        mother_name: document.getElementById('fMother').value || null,
        father_name: document.getElementById('fFather').value || null,
        next_rabies_vaccine_due: document.getElementById('fVaccine').value || null,
        acquisition_by: document.getElementById('fAcqBy').value || null,
        sex: document.getElementById('fSex').value || null,
        castrated_or_spayed: document.getElementById('fSpayed').value,
        castration_or_spay_date: document.getElementById('fSpayDate').value || null
      }
    });
    const photoFile = document.getElementById('fPhotoFile').files[0];
    if (photoFile && r.id) {
      const fd = new FormData(); fd.append('photo', photoFile);
      await apiUpload(`/ferrets/${r.id}/photo`, fd);
    }
    bootstrap.Modal.getInstance(document.getElementById('ferretModal')).hide();
    if (r.aid) alert(`${name} created with internal ID ${r.aid}.`);
    loadFerrets();
  } catch (err) { alert(err.message); }
}