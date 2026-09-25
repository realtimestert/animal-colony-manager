// SanusBio v2.2-beta.3 | 2026-09-16 | app-batch.js
// Batch Care: log the same bath, nail trim, or vaccination for many
// animals at once. Add more event types to BATCH_EVENT_TYPES later
// (weight is the next likely row). Writes go through POST /api/batch-events
// so the rows land in health_event / vaccination_event — the same tables
// as the single-animal modals.

const BATCH_EVENT_TYPES = [
  {
    kind: 'bath',
    label: 'Bath',
    verb: 'Log bath',
    icon: 'bi-droplet',
    family: 'health',
    roles: 'write'
  },
  {
    kind: 'nail_trim',
    label: 'Nail Trim',
    verb: 'Log nail trim',
    icon: 'bi-scissors',
    family: 'health',
    roles: 'write'
  },
  {
    kind: 'vaccination',
    label: 'Vaccination',
    verb: 'Record vaccination',
    icon: 'bi-syringe',
    family: 'vaccination',
    roles: 'admin_research_maternity'
  }
];

let _batchKind = null;
let _batchList = [];
let _batchCandidates = { rooms: [], alerts: [] };
let _batchSearchTimer = null;

function batchKindSpec(kind) {
  return BATCH_EVENT_TYPES.find(t => t.kind === kind) || null;
}

function canUseBatchKind(spec) {
  if (!spec) return false;
  if (spec.roles === 'admin_research_maternity') return typeof canUpdate === 'function' && canUpdate();
  return typeof canWrite === 'function' && canWrite();
}

function batchEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function batchAid(f) {
  return typeof fmtAid === 'function' ? fmtAid(f.animal_id) : (f.animal_id || '');
}

function batchRoomLabel(f) {
  if (!f) return 'Unassigned';
  if (f.room_label) return f.room_label;
  const cage = (f.cage_address || '').trim();
  if (!cage || cage === 'N/A') return 'Unassigned';
  const roomId = f.room_id != null && Number(f.room_id) !== 0 ? String(f.room_id) : '';
  const lighting = (f.room_lighting || '').trim();
  const bit = roomId ? ('R ' + roomId + cage) : cage;
  return lighting ? (bit + ' ' + lighting) : bit;
}

function isBatchEligible(f) {
  if (!f) return false;
  if (f.archived === 1 || f.archived === '1') return false;
  if (f.dead === '1' || f.dead === 1) return false;
  const distributed = f.distributed === 1 || f.distributed === '1';
  const inResearch = f.in_research === 1 || f.in_research === '1';
  if (distributed && !inResearch) return false;
  return true;
}

async function loadBatchCare() {
  if (typeof canWrite === 'function' && !canWrite()) {
    if (typeof nav === 'function') nav('dashboard');
    return;
  }
  document.getElementById('batchVaccTypeBtnWrap')?.classList.toggle('d-none', !(typeof canUpdate === 'function' && canUpdate()));
  if (!_batchKind) {
    const first = BATCH_EVENT_TYPES.find(canUseBatchKind);
    if (first) await selectBatchKind(first.kind);
  } else {
    await selectBatchKind(_batchKind);
  }
}

async function selectBatchKind(kind) {
  const spec = batchKindSpec(kind);
  if (!spec || !canUseBatchKind(spec)) return;
  _batchKind = kind;
  document.querySelectorAll('[data-batch-kind]').forEach(btn => {
    const on = btn.getAttribute('data-batch-kind') === kind;
    btn.classList.toggle('btn-primary', on);
    btn.classList.toggle('btn-outline-primary', !on);
  });
  const card = document.getElementById('batchCareCard');
  if (card) card.classList.remove('d-none');
  const dateEl = document.getElementById('batchDate');
  const timeEl = document.getElementById('batchTime');
  if (dateEl && !dateEl.value && typeof today === 'function') dateEl.value = today();
  if (timeEl && !timeEl.value && typeof nowTime === 'function') timeEl.value = nowTime();
  const isVacc = spec.family === 'vaccination';
  const timeRow = document.getElementById('batchTimeRow');
  const vaccTypeRow = document.getElementById('batchVaccTypeRow');
  const vaccFields = document.getElementById('batchVaccFields');
  if (timeRow) timeRow.style.display = isVacc ? 'none' : '';
  if (vaccTypeRow) vaccTypeRow.style.display = isVacc ? '' : 'none';
  if (vaccFields) vaccFields.style.display = isVacc ? '' : 'none';
  if (isVacc) toggleBatchRabiesDue();
  const result = document.getElementById('batchResult');
  if (result) { result.classList.add('d-none'); result.innerHTML = ''; }
  bindBatchSearch();
  renderBatchChips();
  await refreshBatchCandidates();
}

function toggleBatchRabiesDue() {
  const type = document.getElementById('batchVaccType')?.value;
  const row = document.getElementById('batchVaccNextRow');
  if (row) row.style.display = type === 'rabies' ? '' : 'none';
}

async function refreshBatchCandidates() {
  const spec = batchKindSpec(_batchKind);
  const select = document.getElementById('batchRoomSelect');
  if (!spec) {
    _batchCandidates = { rooms: [], alerts: [] };
    if (select) select.innerHTML = '<option value="">Select room…</option>';
    return;
  }
  try {
    _batchCandidates = await api('/batch-events/candidates?kind=' + encodeURIComponent(spec.kind));
  } catch (err) {
    _batchCandidates = { rooms: [], alerts: [] };
    console.error(err);
  }
  if (!select) return;
  const rooms = _batchCandidates.rooms || [];
  select.innerHTML = '<option value="">Select room…</option>' + rooms.map((r, i) => {
    const flagged = Number(r.flagged || 0);
    const onSite = Number(r.on_site || (r.ferrets || []).length);
    const extra = flagged ? `${flagged} flagged / ${onSite} on site` : `${onSite} on site`;
    return `<option value="${i}">${batchEsc(r.room_label || r.room_name || 'Room')} · ${extra}</option>`;
  }).join('');
}

function bindBatchSearch() {
  const input = document.getElementById('batchFerretSearch');
  if (!input || input.dataset.bound === '1') return;
  input.dataset.bound = '1';
  input.addEventListener('input', () => {
    clearTimeout(_batchSearchTimer);
    _batchSearchTimer = setTimeout(() => runBatchSearch(input.value), 220);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(_batchSearchTimer);
      runBatchSearch(input.value, true);
    } else if (e.key === 'Escape') {
      hideBatchSuggest();
    }
  });
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('batchFerretSearchWrap');
    if (wrap && !wrap.contains(e.target)) hideBatchSuggest();
  });
}

function hideBatchSuggest() {
  const box = document.getElementById('batchFerretSuggest');
  if (!box) return;
  box.classList.add('d-none');
  box.innerHTML = '';
}

async function runBatchSearch(raw, takeSingle) {
  const q = String(raw || '').trim();
  const box = document.getElementById('batchFerretSuggest');
  if (!box) return;
  if (q.length < 1) { hideBatchSuggest(); return; }
  try {
    const matches = (await api('/ferrets?search=' + encodeURIComponent(q)))
      .filter(isBatchEligible);
    if (!matches.length) {
      box.innerHTML = '<div class="list-group-item text-muted small">No on-site ferret matching “' + batchEsc(q) + '”.</div>';
      box.classList.remove('d-none');
      return;
    }
    if (takeSingle && matches.length === 1) {
      addBatchFerret(matches[0]);
      const input = document.getElementById('batchFerretSearch');
      if (input) input.value = '';
      hideBatchSuggest();
      return;
    }
    box.innerHTML = matches.slice(0, 10).map(f => `
      <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2"
        onclick="pickBatchSearchResult(${Number(f.id)})">
        <span><strong>${batchEsc(f.name)}</strong>
          <span class="text-muted small"> · ${batchEsc(batchAid(f))} · ${batchEsc(batchRoomLabel(f))}</span>
        </span>
        <i class="bi bi-plus-lg text-muted"></i>
      </button>`).join('');
    box.dataset.matches = JSON.stringify(matches.slice(0, 10).map(f => ({
      id: f.id, name: f.name, animal_id: f.animal_id,
      room_id: f.room_id, room_name: f.room_name, cage_address: f.cage_address,
      room_lighting: f.room_lighting, room_label: batchRoomLabel(f)
    })));
    box.classList.remove('d-none');
  } catch (err) {
    box.innerHTML = '<div class="list-group-item text-danger small">' + batchEsc(err.message) + '</div>';
    box.classList.remove('d-none');
  }
}

function pickBatchSearchResult(id) {
  const box = document.getElementById('batchFerretSuggest');
  let matches = [];
  try { matches = JSON.parse(box?.dataset.matches || '[]'); } catch { matches = []; }
  const f = matches.find(x => Number(x.id) === Number(id));
  if (f) addBatchFerret(f);
  const input = document.getElementById('batchFerretSearch');
  if (input) input.value = '';
  hideBatchSuggest();
}

function addBatchFerret(f) {
  if (!f || !f.id) return;
  if (!isBatchEligible(f) && f.dead != null) return;
  if (_batchList.some(x => Number(x.id) === Number(f.id))) return;
  _batchList.push({
    id: Number(f.id),
    name: f.name,
    animal_id: f.animal_id,
    room_label: batchRoomLabel(f)
  });
  renderBatchChips();
}

function removeBatchFerret(id) {
  _batchList = _batchList.filter(x => Number(x.id) !== Number(id));
  renderBatchChips();
}

function clearBatchList() {
  _batchList = [];
  renderBatchChips();
}

function renderBatchChips() {
  const host = document.getElementById('batchChipList');
  const countEl = document.getElementById('batchCountLabel');
  const btn = document.getElementById('batchSubmitBtn');
  const spec = batchKindSpec(_batchKind);
  if (!host) return;
  if (!_batchList.length) {
    host.innerHTML = '<span class="text-muted" id="batchChipEmpty">No animals added yet.</span>';
  } else {
    host.innerHTML = _batchList.map(f => `
      <span class="badge rounded-pill text-bg-light border d-inline-flex align-items-center gap-2 py-2 px-3 fw-normal">
        <span><strong>${batchEsc(f.name)}</strong>
          <span class="text-muted"> · ${batchEsc(batchAid(f))} · ${batchEsc(f.room_label || 'Unassigned')}</span>
        </span>
        <button type="button" class="btn-close" style="font-size:.6rem" aria-label="Remove ${batchEsc(f.name)}"
          onclick="removeBatchFerret(${f.id})"></button>
      </span>`).join('');
  }
  const n = _batchList.length;
  if (countEl) countEl.textContent = n === 1 ? '1 animal' : (n + ' animals');
  if (btn) {
    btn.disabled = n < 1 || !spec;
    btn.textContent = spec ? (spec.verb + ' for ' + n + (n === 1 ? ' ferret' : ' ferrets')) : 'Log event';
  }
}

function addBatchRoom() {
  const select = document.getElementById('batchRoomSelect');
  if (!select || select.value === '') return alert('Pick a room first.');
  const room = (_batchCandidates.rooms || [])[Number(select.value)];
  if (!room) return;
  (room.ferrets || []).forEach(addBatchFerret);
}

function addBatchFromAlerts() {
  const alerts = _batchCandidates.alerts || [];
  if (!alerts.length) {
    const spec = batchKindSpec(_batchKind);
    return alert('No ' + (spec ? spec.label.toLowerCase() : 'care') + ' alerts right now.');
  }
  alerts.forEach(addBatchFerret);
}

async function submitBatchCare() {
  const spec = batchKindSpec(_batchKind);
  if (!spec) return;
  if (!_batchList.length) return alert('Add at least one ferret.');
  const event_date = document.getElementById('batchDate')?.value;
  if (!event_date) return alert('Please enter a date.');
  const body = {
    event_kind: spec.kind,
    ferret_ids: _batchList.map(f => f.id),
    event_date,
    notes: document.getElementById('batchNotes')?.value || ''
  };
  if (spec.family === 'health') {
    body.event_time = document.getElementById('batchTime')?.value || '';
  } else {
    const administered_by = (document.getElementById('batchVaccBy')?.value || '').trim();
    if (!administered_by) return alert('Please enter who administered the vaccination.');
    body.vaccine_type = document.getElementById('batchVaccType')?.value || 'rabies';
    body.expiration_date = document.getElementById('batchVaccExpiry')?.value || null;
    body.next_rabies_due = body.vaccine_type === 'rabies'
      ? (document.getElementById('batchVaccNext')?.value || null)
      : null;
    body.administered_by = administered_by;
  }
  const btn = document.getElementById('batchSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const result = document.getElementById('batchResult');
  try {
    const data = await api('/batch-events', { method: 'POST', body });
    const ok = data.ok || [];
    const failed = data.failed || [];
    if (result) {
      const okNames = ok.map(r => batchEsc(r.name || ('#' + r.id))).join(', ');
      const failRows = failed.map(r =>
        '<li>' + batchEsc(r.name || ('#' + r.id)) + ' — ' + batchEsc(r.error || 'failed') + '</li>'
      ).join('');
      result.innerHTML =
        '<div class="alert ' + (failed.length ? 'alert-warning' : 'alert-success') + ' mb-0">' +
        '<div><strong>' + ok.length + '</strong> recorded' +
        (failed.length ? ', <strong>' + failed.length + '</strong> failed' : '') +
        '.</div>' +
        (ok.length ? '<div class="small mt-1">' + okNames + '</div>' : '') +
        (failRows ? '<ul class="small mb-0 mt-2">' + failRows + '</ul>' : '') +
        '</div>';
      result.classList.remove('d-none');
    }
    if (ok.length) {
      const okIds = new Set(ok.map(r => Number(r.id)));
      _batchList = _batchList.filter(f => !okIds.has(Number(f.id)));
      renderBatchChips();
      await refreshBatchCandidates();
    }
  } catch (err) {
    if (result) {
      result.innerHTML = '<div class="alert alert-danger mb-0">' + batchEsc(err.message) + '</div>';
      result.classList.remove('d-none');
    } else {
      alert(err.message);
    }
  } finally {
    renderBatchChips();
  }
}
