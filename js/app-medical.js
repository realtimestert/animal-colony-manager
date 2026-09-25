// SanusBio v2.2-beta.4 | 2026-09-17 | app-medical.js
// v2.2-beta.4: Veterinarian communication log on the merged Medical Info tab.
// v2.2-beta.1: Care-log print; Litters tab hides sibling groups after
//          sexual-maturity split (26 wk or kits_separated_at).
// v2.1-beta.7: Partner picker shows expected offspring CoI; edit partner on a
//          mated event; kit deaths stay separate from stillborns.
// Health Events, Vaccinations, Litters, Medical Info, Procedures
// v1.9.4: added Litter Care Log (kit weighing, nest changes, supplemental feeding)
//         and pre-ID Kit Death logging, accessed via "Care Log" on litter rows
// v1.10.0: mating records now support a "pulled date" (date female separated
//          from male) used to compute an expected-litter date RANGE
// v1.10.1: litterCreatableCount() excludes stillborn from kits left to create
// v1.10.2: FIX — removed a duplicate submitReproEvent() declaration that was
//          silently overriding the original (photo-upload-capable) version,
//          which meant photos attached in the Record Reproductive Event
//          modal were never actually uploaded
// v1.10.3: health events can now be edited (openEditHealthModal — mainly for
//          correcting event_date entry errors) and deleted (deleteHealthEvent)
//          from the Health Events tab; both restricted to admin/research/
//          maternity (canUpdate()) in the ferret-detail UI

// ─── Health Event Modal ───────────────────────────────────────────────────────
function openHealthModal(ferretId) {
  document.getElementById('heFerretId').value = ferretId;
  document.getElementById('heEventId').value = '';
  document.getElementById('healthModalTitle').textContent = 'Record Health Event';
  document.getElementById('heType').disabled = false;
  document.getElementById('heDate').value = today();
  document.getElementById('heTime').value = nowTime();
  document.getElementById('heWeight').value = '';
  document.getElementById('heNotes').value = '';
  document.getElementById('heType').value = 'weight';
  toggleWeightRow();
  new bootstrap.Modal(document.getElementById('healthModal')).show();
}

// Edit an existing health event — looks it up from _currentHealthEvents
// (populated by loadFerretDetail) rather than passing data through onclick
// attributes, to avoid quoting/escaping issues with notes text.
function openEditHealthModal(eventId) {
  const h = (window._currentHealthEvents || []).find(x => x.health_event_id === eventId);
  if (!h) return alert('Health event not found.');
  document.getElementById('heFerretId').value = h.ferret_id;
  document.getElementById('heEventId').value = h.health_event_id;
  document.getElementById('healthModalTitle').textContent = 'Edit Health Event';
  document.getElementById('heType').value = h.event_type;
  document.getElementById('heType').disabled = true; // event type isn't editable, only date/weight/notes
  document.getElementById('heDate').value = h.event_date ? String(h.event_date).slice(0, 10) : today();
  document.getElementById('heTime').value = nowTime();
  document.getElementById('heWeight').value = h.weight != null ? h.weight : '';
  document.getElementById('heNotes').value = h.notes || '';
  toggleWeightRow();
  new bootstrap.Modal(document.getElementById('healthModal')).show();
}

function toggleWeightRow() {
  document.getElementById('heWeightRow').style.display =
    document.getElementById('heType').value === 'weight' ? '' : 'none';
}

async function submitHealthEvent() {
  const ferret_id = document.getElementById('heFerretId').value;
  const eventId = document.getElementById('heEventId').value;
  const type = document.getElementById('heType').value;
  const wt = parseFloat(document.getElementById('heWeight').value);
  if (isNaN(wt) && type === 'weight') return alert('Please enter a valid weight.');
  const event_date = document.getElementById('heDate').value;
  if (!event_date) return alert('Please enter a date.');
  try {
    if (eventId) {
      await api(`/health-events/${eventId}`, {
        method: 'PUT', body: {
          event_date,
          weight: type === 'weight' ? wt : undefined,
          notes: document.getElementById('heNotes').value
        }
      });
    } else {
      await api('/health-events', {
        method: 'POST', body: {
          ferret_id: parseInt(ferret_id),
          event_type: type,
          weight: type === 'weight' ? wt : null,
          event_date,
          event_time: document.getElementById('heTime').value,
          notes: document.getElementById('heNotes').value
        }
      });
    }
    bootstrap.Modal.getInstance(document.getElementById('healthModal')).hide();
    document.getElementById('heType').disabled = false;
    loadFerretDetail(ferret_id);
  } catch (err) { alert(err.message); }
}

async function deleteHealthEvent(eventId, ferretId) {
  if (!confirm('Delete this health event record? This cannot be undone.')) return;
  try {
    await api(`/health-events/${eventId}`, { method: 'DELETE' });
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

// ─── Vaccination ──────────────────────────────────────────────────────────────
function toggleRabiesDue() {
  document.getElementById('vNextRabiesRow').style.display =
    document.getElementById('vType').value === 'rabies' ? '' : 'none';
}

function openVaccModal(ferretId) {
  document.getElementById('vFerretId').value = ferretId;
  document.getElementById('vDate').value = today();
  document.getElementById('vExpiry').value = '';
  document.getElementById('vNextRabies').value = '';
  document.getElementById('vNotes').value = '';
  document.getElementById('vAdministeredBy').value = '';
  document.getElementById('vType').value = 'rabies';
  toggleRabiesDue();
  new bootstrap.Modal(document.getElementById('vaccModal')).show();
}

async function submitVaccination() {
  const ferret_id = document.getElementById('vFerretId').value;
  const administered_by = document.getElementById('vAdministeredBy').value.trim();
  if (!administered_by) return alert('Please enter who administered the vaccination.');
  try {
    await api('/vaccinations', {
      method: 'POST', body: {
        ferret_id: parseInt(ferret_id),
        vaccine_type: document.getElementById('vType').value,
        vaccination_date: document.getElementById('vDate').value,
        expiration_date: document.getElementById('vExpiry').value || null,
        next_rabies_due: document.getElementById('vNextRabies').value || null,
        administered_by,
        notes: document.getElementById('vNotes').value
      }
    });
    bootstrap.Modal.getInstance(document.getElementById('vaccModal')).hide();
    loadFerretDetail(ferret_id);
  } catch (err) { alert(err.message); }
}

// ─── Litters Page ─────────────────────────────────────────────────────────────
// Stillborn (and any logged pre-ID kit deaths) never get individuated, so the
// "kits left to create" count excludes them — use surviving_litter_count when
// the server has computed it, otherwise fall back to kit_count - stillborn.
function litterCreatableCount(l) {
  if (l.surviving_litter_count != null) return l.surviving_litter_count;
  return Math.max(0, (l.kit_count || 0) - (l.stillborn || 0) - (l.infant_deaths || 0));
}

// Sibling group stays on the Litters tab until split at sexual maturity.
// 26 weeks = existing infancy → adolescence line. Manual kits_separated_at wins.
const LITTER_GROUP_DAYS = 182;

function litterAgeDays(l) {
  if (!l || !l.litter_date) return null;
  const d = new Date(l.litter_date);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  d.setHours(12, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / 864e5);
}

function isLitterStillGrouped(l) {
  if (l.kits_separated_at) return false;
  const created = Number(l.individuals_created || 0);
  if (created <= 0) return true;
  const age = litterAgeDays(l);
  if (age == null) return true;
  return age < LITTER_GROUP_DAYS;
}

async function loadLitters() {
  if (canUpdate()) document.getElementById('btnAddLitterMain').classList.remove('d-none');
  try {
    const litters = await api('/litters');
    const tbody = document.getElementById('litterTable');
    const showSeparated = document.getElementById('litterShowSeparated')?.checked;
    const visible = showSeparated ? litters : litters.filter(isLitterStillGrouped);
    if (!visible.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-muted text-center py-4">' +
        (litters.length
          ? 'No active sibling groups. Check “Show separated / mature” for older litters (they stay in Reports).'
          : 'No litter records yet.') +
        '</td></tr>';
      return;
    }
    tbody.innerHTML = visible.map(l => {
      const creatable = litterCreatableCount(l);
      const grouped = isLitterStillGrouped(l);
      const age = litterAgeDays(l);
      const maturityHint = grouped && Number(l.individuals_created || 0) > 0 && age != null && age >= 154
        ? `<div class="small text-warning">Sexual maturity soon — separate when the group is split</div>`
        : '';
      const separatedBadge = !grouped
        ? `<span class="badge bg-secondary-subtle text-secondary border align-self-center">Separated${l.kits_separated_at ? ' ' + fmtDate(l.kits_separated_at) : ' (26+ wk)'}</span>`
        : '';
      return `
  <tr>
    <td>${fmtDate(l.litter_date)}</td>
    <td>${l.litter_id || '—'}${maturityHint}</td>
    <td><strong>${l.jill_name || '—'}</strong></td>
    <td>${l.father || '—'}</td>
    <td>${l.kit_count ?? '—'}</td>
    <td>${l.stillborn ?? '—'}</td>
    <td>${l.infant_deaths ?? 0}</td>
    <td>${l.individuals_created ?? 0} / ${creatable}</td>
    <td class="small text-muted">${l.anomalies_and_notes || '—'}</td>
    <td>
      <div class="d-flex gap-1 flex-wrap">
        <button class="btn btn-sm btn-outline-secondary" onclick="openLitterDetailModal(${l.litter_log_id})"><i class="bi bi-journal-medical me-1"></i>Care Log</button>
        ${canUpdate() && (!l.individuals_created || l.individuals_created < creatable)
        ? `<button class="btn btn-sm btn-outline-success" onclick="openCreateFromLitter(${l.litter_log_id})"><i class="bi bi-egg me-1"></i>Create Ferrets</button>`
        : (creatable && l.individuals_created >= creatable
            ? `<span class="badge bg-success-subtle text-success border border-success-subtle align-self-center">All kits created</span>`
            : '')}
        ${canUpdate() && grouped && Number(l.individuals_created || 0) > 0
          ? `<button class="btn btn-sm btn-outline-secondary" onclick="markLitterSeparated(${l.litter_log_id})">Mark separated</button>`
          : separatedBadge}
      </div>
    </td>
  </tr>`;
    }).join('');
  } catch (err) { console.error(err); }
}

async function openGlobalLitterModal() {
  try {
    const ferrets = await api('/ferrets');
    const females = ferrets.filter(f => f.sex === 'female' && f.dead !== '1');
    // Sort: mated females first, then by name
    const mated = females.filter(f => f.female_status === 'mated');
    const others = females.filter(f => f.female_status !== 'mated');
    const sorted = [...mated, ...others];
    document.getElementById('litJillSelect').innerHTML =
      (mated.length ? `<optgroup label="── Mated (priority) ──">` +
        mated.map(f => `<option value="${f.id}">${f.name} (ID: ${f.animal_id || '—'}) ★ Mated</option>`).join('') +
        `</optgroup>` : '') +
      (others.length ? `<optgroup label="── Other Females ──">` +
        others.map(f => `<option value="${f.id}">${f.name} (ID: ${f.animal_id || '—'})${f.female_status && f.female_status !== 'baseline' ? ' [' + f.female_status + ']' : ''}</option>`).join('') +
        `</optgroup>` : '');
    document.getElementById('litJillRow').style.display = '';
    document.getElementById('litFerretId').value = '';
    document.getElementById('litDate').value = today();
    document.getElementById('litId').value = '';
    document.getElementById('litKits').value = '';
    document.getElementById('litStillborn').value = 0;
    document.getElementById('litFather').value = '';
    document.getElementById('litMother').value = '';
    document.getElementById('litNotes').value = '';
    new bootstrap.Modal(document.getElementById('litterModal')).show();
    prefillNextLitterId();
  } catch (err) { alert(err.message); }
}

function openLitterModal(ferretId) {
  document.getElementById('litFerretId').value = ferretId;
  document.getElementById('litJillRow').style.display = 'none';
  document.getElementById('litDate').value = today();
  document.getElementById('litId').value = '';
  document.getElementById('litKits').value = '';
  document.getElementById('litStillborn').value = 0;
  document.getElementById('litFather').value = '';
  document.getElementById('litMother').value = '';
  document.getElementById('litNotes').value = '';
  new bootstrap.Modal(document.getElementById('litterModal')).show();
  prefillNextLitterId();
}

async function prefillNextLitterId() {
  const input = document.getElementById('litId');
  if (!input) return;
  try {
    const r = await api('/litters/next-id');
    if (r && r.litter_id) {
      input.value = r.litter_id;
      input.readOnly = true;
      input.title = 'Assigned automatically from the latest Litter ID';
    }
  } catch (_) {
    input.readOnly = false;
  }
}

async function submitLitter() {
  let ferretId = document.getElementById('litFerretId').value;
  if (!ferretId) ferretId = document.getElementById('litJillSelect').value;
  if (!ferretId) return alert('Please select a jill (mother).');
  try {
    await api('/litters', {
      method: 'POST', body: {
        Ferret_QR005_id: parseInt(ferretId),
        litter_id: document.getElementById('litId').value || null,
        litter_date: document.getElementById('litDate').value,
        kit_count: parseInt(document.getElementById('litKits').value) || null,
        stillborn: parseInt(document.getElementById('litStillborn').value) || null,
        father: document.getElementById('litFather').value || null,
        mother: document.getElementById('litMother').value || null,
        anomalies_and_notes: document.getElementById('litNotes').value || null
      }
    });
    bootstrap.Modal.getInstance(document.getElementById('litterModal')).hide();
    if (_currentFerretId) loadFerretDetail(_currentFerretId);
    else loadLitters();
  } catch (err) { alert(err.message); }
}

// ─── Create Ferrets from Litter ───────────────────────────────────────────────
async function openCreateFromLitter(litterId) {
  document.getElementById('cflLitterId').value = litterId;
  try {
    const litters = await api('/litters');
    const litter = litters.find(l => l.litter_log_id === litterId);
    if (!litter) return;
    const remaining = litterCreatableCount(litter) - (litter.individuals_created || 0);
    document.getElementById('cflLitterInfo').innerHTML =
      `<strong>Litter:</strong> ${litter.litter_id || '—'} &nbsp;|&nbsp;
   <strong>Date:</strong> ${fmtDate(litter.litter_date)} &nbsp;|&nbsp;
   <strong>Jill:</strong> ${litter.jill_name} &nbsp;|&nbsp;
   <strong>Father:</strong> ${litter.father || '—'} &nbsp;|&nbsp;
   <strong>Stillborn:</strong> ${litter.stillborn ?? 0} &nbsp;|&nbsp;
   <strong>Kits remaining to create:</strong> ${Math.max(0, remaining)}`;
    document.getElementById('cflKitList').innerHTML = '';
    for (let i = 0; i < Math.max(1, remaining); i++) addKitRow();
    new bootstrap.Modal(document.getElementById('createFromLitterModal')).show();
  } catch (err) { alert(err.message); }
}

let _kitRowCount = 0;
function addKitRow() {
  _kitRowCount++;
  const div = document.createElement('div');
  div.className = 'kit-row d-flex gap-2 align-items-center flex-wrap';
  div.id = `kit-${_kitRowCount}`;
  div.innerHTML = `
<div style="flex:2;min-width:140px"><label class="form-label small mb-1">Name *</label>
  <input class="form-control form-control-sm kit-name" placeholder="Ferret name"></div>
<div style="flex:1;min-width:100px"><label class="form-label small mb-1">Sex</label>
  <select class="form-select form-select-sm kit-sex">
    <option value="">Unknown</option><option value="male">Male</option><option value="female">Female</option>
  </select></div>
<div style="flex:1;min-width:100px"><label class="form-label small mb-1">Weight (g)</label>
  <input class="form-control form-control-sm kit-weight" type="number" value="0"></div>
<button class="btn btn-sm btn-outline-danger mt-3" onclick="this.parentElement.remove()"><i class="bi bi-trash"></i></button>`;
  document.getElementById('cflKitList').appendChild(div);
}

async function submitCreateFromLitter() {
  const litterId = document.getElementById('cflLitterId').value;
  const rows = document.querySelectorAll('#cflKitList .kit-row');
  const kits = [];
  for (const row of rows) {
    const name = row.querySelector('.kit-name').value.trim();
    if (!name) return alert('Each kit must have a name.');
    kits.push({
      ferret_name: name,
      sex: row.querySelector('.kit-sex').value || null,
      weight: parseInt(row.querySelector('.kit-weight').value) || 0
    });
  }
  if (!kits.length) return alert('Add at least one kit.');
  try {
    const r = await api(`/litters/${litterId}/create-ferrets`, { method: 'POST', body: { kits } });
    bootstrap.Modal.getInstance(document.getElementById('createFromLitterModal')).hide();
    const aidNote = Array.isArray(r.aids) && r.aids.length
      ? `\nInternal AIDs: ${r.aids.join(', ')}`
      : '';
    alert(`${r.created_ids.length} ferret(s) created successfully.${aidNote}`);
    refreshMaternityBoards();
    if (_ldLitterId === Number(litterId) || String(_ldLitterId) === String(litterId)) {
      openLitterDetailModal(Number(litterId));
    }
  } catch (err) { alert(err.message); }
}

// ─── Medical Info ─────────────────────────────────────────────────────────────
function openMedModal(ferretId, medInfoId) {
  document.getElementById('medFerretId').value = ferretId;
  document.getElementById('medInfoId').value = medInfoId;
  document.getElementById('medSpayed').value = 'n';
  document.getElementById('medSpayDate').value = '';
  document.getElementById('medOrders').value = '';
  document.getElementById('medTreatments').value = '';
  new bootstrap.Modal(document.getElementById('medModal')).show();
}

async function submitMedicalInfo() {
  const ferretId = document.getElementById('medFerretId').value;
  try {
    await api(`/ferrets/${ferretId}/medical`, {
      method: 'PUT', body: {
        castrated_or_spayed: document.getElementById('medSpayed').value,
        castration_or_spay_date: document.getElementById('medSpayDate').value || null,
        orders: document.getElementById('medOrders').value || null,
        treatments: document.getElementById('medTreatments').value || null
      }
    });
    bootstrap.Modal.getInstance(document.getElementById('medModal')).hide();
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

// ─── Exam / Health Check Notes ────────────────────────────────────────────────
function openExamNoteModal(ferretId) {
  document.getElementById('enFerretId').value = ferretId;
  document.getElementById('enDate').value = today();
  document.getElementById('enWeight').value = '';
  document.getElementById('enStatus').value = '';
  document.getElementById('enPerformedBy').value = '';
  document.getElementById('enNotes').value = '';
  new bootstrap.Modal(document.getElementById('examNoteModal')).show();
}

async function submitExamNote() {
  const ferretId = document.getElementById('enFerretId').value;
  const exam_date = document.getElementById('enDate').value;
  if (!exam_date) return alert('Exam date is required.');
  try {
    await api(`/ferrets/${ferretId}/exam-notes`, {
      method: 'POST', body: {
        exam_date,
        weight_grams: document.getElementById('enWeight').value || null,
        status: document.getElementById('enStatus').value || null,
        notes: document.getElementById('enNotes').value || null,
        performed_by: document.getElementById('enPerformedBy').value || null
      }
    });
    bootstrap.Modal.getInstance(document.getElementById('examNoteModal')).hide();
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

// ─── Procedure Modal ──────────────────────────────────────────────────────────
function openProcedureModal(ferretId) {
  document.getElementById('procFerretId').value = ferretId;
  document.getElementById('procName').value = '';
  document.getElementById('procDate').value = today();
  document.getElementById('procPerformedBy').value = '';
  document.getElementById('procNotes').value = '';
  new bootstrap.Modal(document.getElementById('procedureModal')).show();
}

async function submitProcedure() {
  const ferretId = document.getElementById('procFerretId').value;
  const name = document.getElementById('procName').value.trim();
  const date = document.getElementById('procDate').value;
  if (!name || !date) return alert('Procedure name and date are required.');
  try {
    await api(`/ferrets/${ferretId}/procedure`, {
      method: 'POST', body: {
        procedure_name: name,
        procedure_date: date,
        performed_by: document.getElementById('procPerformedBy').value || null,
        notes: document.getElementById('procNotes').value || null
      }
    });
    bootstrap.Modal.getInstance(document.getElementById('procedureModal')).hide();
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

// ─── Veterinarian communication ───────────────────────────────────────────────
const VET_KIND_META = {
  note: { label: 'Note', color: 'secondary' },
  question: { label: 'Question', color: 'info' },
  recommendation: { label: 'Recommendation', color: 'primary' },
  prescription: { label: 'Prescription', color: 'warning' },
  follow_up: { label: 'Follow-up', color: 'danger' }
};

function vetKindMeta(kind) {
  return VET_KIND_META[kind] || VET_KIND_META.note;
}

function openVetCommModal(ferretId) {
  document.getElementById('vcFerretId').value = ferretId;
  document.getElementById('vcDate').value = today();
  document.getElementById('vcSide').value = 'staff';
  document.getElementById('vcKind').value = 'note';
  document.getElementById('vcVetName').value = '';
  document.getElementById('vcFollowUp').value = '';
  document.getElementById('vcBody').value = '';
  new bootstrap.Modal(document.getElementById('vetCommModal')).show();
}

async function submitVetComm() {
  const ferretId = document.getElementById('vcFerretId').value;
  const comm_date = document.getElementById('vcDate').value;
  const body = document.getElementById('vcBody').value.trim();
  if (!comm_date) return alert('Date is required.');
  if (!body) return alert('Message is required.');
  try {
    await api(`/ferrets/${ferretId}/vet-communications`, {
      method: 'POST',
      body: {
        comm_date,
        author_side: document.getElementById('vcSide').value,
        kind: document.getElementById('vcKind').value,
        vet_name: document.getElementById('vcVetName').value.trim() || null,
        follow_up_date: document.getElementById('vcFollowUp').value || null,
        body
      }
    });
    bootstrap.Modal.getInstance(document.getElementById('vetCommModal')).hide();
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

async function deleteVetComm(commId, ferretId) {
  if (!confirm('Delete this veterinarian note?')) return;
  try {
    await api(`/vet-communications/${commId}`, { method: 'DELETE' });
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

async function setVetFollowUpDone(ferretId, commId, done) {
  try {
    await api(`/ferrets/${ferretId}/vet-communications/${commId}`, {
      method: 'PATCH',
      body: { follow_up_done: done ? 1 : 0 }
    });
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

function scrollMedSection(sectionId) {
  const el = document.getElementById(sectionId);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function vetFollowUpsOpen(comms) {
  const todayStr = today();
  return (comms || []).filter(c => {
    const fu = c.follow_up_date ? String(c.follow_up_date).slice(0, 10) : '';
    return fu && !c.follow_up_done && fu <= todayStr;
  });
}

function renderVetCommSection(id, comms) {
  const list = comms || [];
  const openFollow = vetFollowUpsOpen(list);
  const todayStr = today();
  const cards = list.length ? list.map(c => {
    const meta = vetKindMeta(c.kind);
    const sideLabel = c.author_side === 'veterinarian' ? 'Veterinarian' : 'Staff';
    const sideCls = c.author_side === 'veterinarian' ? 'success' : 'secondary';
    const fu = c.follow_up_date ? String(c.follow_up_date).slice(0, 10) : '';
    const overdue = fu && !c.follow_up_done && fu <= todayStr;
    const fuBadge = fu
      ? (c.follow_up_done
        ? `<span class="badge bg-success">Follow-up done ${fmtDate(fu)}</span>`
        : `<span class="badge ${overdue ? 'bg-danger' : 'bg-warning text-dark'}">${overdue ? 'Follow-up overdue' : 'Follow up'} ${fmtDate(fu)}</span>`)
      : '';
    return `
      <div class="border rounded p-3 ${overdue ? 'border-danger' : ''}">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
          <strong>${fmtDate(c.comm_date)}</strong>
          <span class="badge bg-${sideCls}">${sideLabel}</span>
          <span class="badge bg-${meta.color}${meta.color === 'warning' ? ' text-dark' : ''}">${meta.label}</span>
          ${c.vet_name ? `<span class="text-muted small">${c.vet_name}</span>` : ''}
          ${fuBadge}
          ${c.recorded_by ? `<span class="text-muted small ms-auto">By: ${c.recorded_by}</span>` : ''}
        </div>
        <div class="small" style="white-space:pre-wrap;line-height:1.6">${c.body || ''}</div>
        <div class="d-flex gap-2 mt-2">
          ${fu && canWrite() ? (c.follow_up_done
            ? `<button class="btn btn-sm btn-outline-secondary" onclick="setVetFollowUpDone(${id},${c.comm_id},0)">Reopen follow-up</button>`
            : `<button class="btn btn-sm btn-outline-success" onclick="setVetFollowUpDone(${id},${c.comm_id},1)">Mark follow-up done</button>`) : ''}
          ${canUpdate() ? `<button class="btn btn-sm btn-outline-danger ms-auto" onclick="deleteVetComm(${c.comm_id}, ${id})" title="Delete"><i class="bi bi-trash"></i></button>` : ''}
        </div>
      </div>`;
  }).join('') : '<p class="text-muted small mb-0">No veterinarian notes yet. Record questions for the vet and what they recommended.</p>';

  return `
    <div id="ferret-vet" class="mb-4">
      <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
        <h6 class="fw-semibold text-muted small text-uppercase mb-0">Veterinarian</h6>
        ${openFollow.length ? `<span class="badge bg-danger">${openFollow.length} follow-up${openFollow.length === 1 ? '' : 's'}</span>` : ''}
        ${canWrite() ? `<button class="btn btn-sm btn-primary ms-auto" onclick="openVetCommModal(${id})"><i class="bi bi-plus-lg me-1"></i>Add note</button>` : ''}
      </div>
      <p class="text-muted small mb-2">Questions for the vet and what they said. Staff record both sides — there is no separate vet login.</p>
      <div class="d-flex flex-column gap-2">${cards}</div>
    </div>`;
}

// ─── Reproductive Events ──────────────────────────────────────────────────────
const REPRO_STATUS_META = {
  baseline: { label: 'Baseline', color: 'secondary', icon: 'bi-circle' },
  estrus: { label: 'In Estrus', color: 'danger', icon: 'bi-heart-fill' },
  mated: { label: 'Mated', color: 'warning', icon: 'bi-arrow-through-heart-fill' },
  littered: { label: 'Littered', color: 'success', icon: 'bi-egg-fill' },
  weaned: { label: 'Weaned', color: 'info', icon: 'bi-check-circle-fill' },
};

function reproStatusBadge(status) {
  if (!status || status === 'baseline') return '';
  const m = REPRO_STATUS_META[status] || { label: status, color: 'secondary', icon: 'bi-circle' };
  return `<span class="badge bg-${m.color} badge-pill small"><i class="bi ${m.icon} me-1"></i>${m.label}</span>`;
}

function openReproModal(ferretId) {
  document.getElementById('reproFerretId').value = ferretId;
  document.getElementById('reproDate').value = today();
  document.getElementById('reproType').value = 'estrus';
  document.getElementById('reproPartnerRow').style.display = 'none';
  document.getElementById('reproNotes').value = '';
  document.getElementById('reproPartnerSelect').innerHTML = '<option value="">— None —</option>';
  const pf = document.getElementById('reproPhotoFile'); if (pf) pf.value = '';
  const pp = document.getElementById('reproPhotoPreview'); if (pp) pp.innerHTML = '';
  new bootstrap.Modal(document.getElementById('reproModal')).show();
}

async function submitReproEvent() {
  const ferretId = document.getElementById('reproFerretId').value;
  const event_type = document.getElementById('reproType').value;
  const event_date = document.getElementById('reproDate').value;
  const partner_id = document.getElementById('reproPartnerSelect').value || null;
  const notes = document.getElementById('reproNotes').value.trim();
  if (!event_date) return alert('Date is required.');
  try {
    const r = await api(`/ferrets/${ferretId}/reproductive`, {
      method: 'POST', body: { event_type, event_date, partner_id: partner_id ? parseInt(partner_id) : null, notes: notes || null }
    });
    const photoFile = document.getElementById('reproPhotoFile')?.files[0];
    if (photoFile && r.id) {
      const fd = new FormData(); fd.append('photo', photoFile);
      await apiUpload(`/ferrets/${ferretId}/reproductive/${r.id}/photo`, fd);
    }
    bootstrap.Modal.getInstance(document.getElementById('reproModal')).hide();
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

async function onReproTypeChange() {
  const type = document.getElementById('reproType').value;
  const partnerRow = document.getElementById('reproPartnerRow');
  const coiEl = document.getElementById('reproPartnerCoi');
  if (coiEl) coiEl.innerHTML = '';
  if (type === 'mated') {
    partnerRow.style.display = '';
    try {
      const ferrets = await api('/ferrets');
      const males = ferrets.filter(f => f.sex === 'male' && f.dead !== '1' && f.distributed != 1 && f.in_research != 1 && !f.distribution_tag);
      document.getElementById('reproPartnerSelect').innerHTML =
        '<option value="">— Unknown / Not recorded —</option>' +
        males.map(m => `<option value="${m.id}">${m.name} (ID: ${m.animal_id || '—'})</option>`).join('');
    } catch { /* non-fatal */ }
  } else {
    partnerRow.style.display = 'none';
  }
}

async function showPairCoi(elId, idA, idB) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!idA || !idB) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = '<span class="text-muted small">Calculating CoI…</span>';
  try {
    const d = await api(`/stats/genetics/relatedness?a=${idA}&b=${idB}`);
    const pct = d.expected_offspring_coi_pct;
    const interp = d.expected_offspring_interpretation || {};
    const n = pct == null ? 0 : Number(pct);
    const cls = n >= 25 ? 'danger' : n >= 12.5 ? 'warning' : 'success';
    const partner = d.b || {};
    el.innerHTML = `<div class="small">Expected offspring CoI: <strong class="text-${cls}">${pct != null ? pct + '%' : '—'}</strong>
      <span class="text-muted">${interp.label ? ' · ' + interp.label : ''}</span></div>
      <div class="text-muted small">${partner.name ? partner.name + ' CoI ' + (partner.coi_pct != null ? partner.coi_pct + '%' : '—') + ' · ' : ''}Relatedness R = ${d.relatedness_pct != null ? d.relatedness_pct + '%' : ''}${interp.detail ? ' · ' + interp.detail : ''}</div>`;
  } catch (err) {
    el.innerHTML = `<span class="text-muted small">CoI unavailable${err.message ? ' — ' + err.message : ''}</span>`;
  }
}

function onReproPartnerChange() {
  const femaleId = document.getElementById('reproFerretId')?.value;
  const maleId = document.getElementById('reproPartnerSelect')?.value;
  showPairCoi('reproPartnerCoi', femaleId, maleId);
}

function onMatingPartnerChange() {
  const ferretId = document.getElementById('matingFerretId')?.value;
  const partnerId = document.getElementById('matingPartnerSelect')?.value;
  showPairCoi('matingPartnerCoi', ferretId, partnerId);
}

function onEditPartnerChange() {
  const femaleId = document.getElementById('epFerretId')?.value;
  const maleId = document.getElementById('epPartnerSelect')?.value;
  showPairCoi('epPartnerCoi', femaleId, maleId);
}

async function openEditPartnerModal(ferretId, eventId, currentPartnerId) {
  document.getElementById('epFerretId').value = ferretId;
  document.getElementById('epEventId').value = eventId;
  const coiEl = document.getElementById('epPartnerCoi');
  if (coiEl) coiEl.innerHTML = '';
  try {
    const ferrets = await api('/ferrets');
    const males = ferrets.filter(f => f.sex === 'male' && f.dead !== '1' && f.distributed != 1 && f.in_research != 1 && !f.distribution_tag);
    const sel = document.getElementById('epPartnerSelect');
    sel.innerHTML =
      '<option value="">— Unknown / Not recorded —</option>' +
      males.map(m => `<option value="${m.id}">${m.name} (ID: ${m.animal_id || '—'})</option>`).join('');
    if (currentPartnerId) sel.value = String(currentPartnerId);
    new bootstrap.Modal(document.getElementById('editPartnerModal')).show();
    if (currentPartnerId) showPairCoi('epPartnerCoi', ferretId, currentPartnerId);
  } catch (err) { alert(err.message); }
}

async function submitEditPartner() {
  const ferretId = document.getElementById('epFerretId').value;
  const eventId = document.getElementById('epEventId').value;
  const raw = document.getElementById('epPartnerSelect').value;
  const partner_id = raw ? parseInt(raw, 10) : null;
  try {
    await api(`/ferrets/${ferretId}/reproductive/${eventId}/partner`, {
      method: 'PUT',
      body: { partner_id }
    });
    bootstrap.Modal.getInstance(document.getElementById('editPartnerModal')).hide();
    if (_currentFerretId) loadFerretDetail(_currentFerretId);
  } catch (err) { alert(err.message); }
}

async function deleteReproEvent(ferretId, eventId) {
  if (!confirm('Delete this reproductive event? The ferret status will be recalculated.')) return;
  try {
    await api(`/ferrets/${ferretId}/reproductive/${eventId}`, { method: 'DELETE' });
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

// ─── Expected Litter Range (6wk from mating date → 6wk from pulled date) ──────
function expectedLitterRangeLabel(m) {
  const start = m.expected_litter_start;
  const end = m.expected_litter_end;
  if (!start && !end) return '—';
  if (start && end) {
    if (fmtDate(start) === fmtDate(end)) return fmtDate(start);
    return `${fmtDate(start)} – ${fmtDate(end)}`;
  }
  return fmtDate(start || end) + ' (est. — no pulled date yet)';
}

function openPulledDateModal(ferretId, eventId, currentDate) {
  document.getElementById('pdFerretId').value = ferretId;
  document.getElementById('pdEventId').value = eventId;
  document.getElementById('pdDate').value = currentDate ? String(currentDate).slice(0, 10) : today();
  new bootstrap.Modal(document.getElementById('pulledDateModal')).show();
}

async function submitPulledDate() {
  const ferretId = document.getElementById('pdFerretId').value;
  const eventId = document.getElementById('pdEventId').value;
  const pulled_date = document.getElementById('pdDate').value;
  if (!pulled_date) return alert('Please choose a date.');
  try {
    await api(`/ferrets/${ferretId}/reproductive/${eventId}/pulled-date`, { method: 'PUT', body: { pulled_date } });
    bootstrap.Modal.getInstance(document.getElementById('pulledDateModal')).hide();
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

// ─── Mating History ───────────────────────────────────────────────────────────
async function openMatingModal(ferretId) {
  document.getElementById('matingFerretId').value = ferretId;
  document.getElementById('matingDate').value = today();
  document.getElementById('matingNotes').value = '';
  try {
    const ferrets = await api('/ferrets');
    const current = ferrets.find(f => f.id === ferretId);
    if (!current?.sex) return alert("This ferret's sex must be set before recording a mating.");
    const partnerSex = current.sex === 'male' ? 'female' : 'male';
    const partners = ferrets.filter(f => f.sex === partnerSex && f.dead !== '1' && !f.distributed);
    document.getElementById('matingPartnerLabel').textContent = partnerSex === 'male' ? 'Male Partner' : 'Female Partner';
    document.getElementById('matingPartnerSelect').innerHTML =
      '<option value="">— Select —</option>' +
      partners.map(p => `<option value="${p.id}">${p.name} (ID: ${p.animal_id || '—'})</option>`).join('');
    const coiEl = document.getElementById('matingPartnerCoi');
    if (coiEl) coiEl.innerHTML = '';
    new bootstrap.Modal(document.getElementById('matingModal')).show();
  } catch (err) { alert(err.message); }
}

async function submitMatingRecord() {
  const ferretId = document.getElementById('matingFerretId').value;
  const partner_id = document.getElementById('matingPartnerSelect').value;
  const event_date = document.getElementById('matingDate').value;
  const notes = document.getElementById('matingNotes').value.trim();
  if (!partner_id) return alert('Please select a partner.');
  if (!event_date) return alert('Date is required.');
  try {
    await api(`/ferrets/${ferretId}/matings`, {
      method: 'POST', body: { partner_id: parseInt(partner_id), event_date, notes: notes || null }
    });
    bootstrap.Modal.getInstance(document.getElementById('matingModal')).hide();
    loadFerretDetail(ferretId);
  } catch (err) { alert(err.message); }
}

// ─── Litter Detail (Kit Deaths + Care Log) ────────────────────────────────────
let _ldLitterId = null;
let _ldLitter = null;
const KIT_DEATH_CAUSE_LABELS = {
  mother_ate: 'Mother ate / cannibalized',
  fell_from_cage: 'Fell from cage',
  crushed: 'Crushed / overlain',
  failure_to_thrive: 'Failure to thrive',
  unknown: 'Unknown',
  other: 'Other'
};
const CARE_EVENT_TYPE_LABELS = {
  weight: 'Kit Weighing',
  nest_change: 'Nest Box Change',
  supplemental_feeding: 'Supplemental Feeding',
  feeding_check: 'Feeding Check',
  other: 'Other'
};

async function openLitterDetailModal(litterLogId) {
  _ldLitterId = litterLogId;
  document.getElementById('ldLitterId').value = litterLogId;
  document.getElementById('ldSummary').textContent = 'Loading…';
  document.getElementById('ldKitDeathTable').innerHTML = '';
  document.getElementById('ldCareEventTable').innerHTML = '';
  document.getElementById('ldAddKitDeathBtn').style.display = canUpdate() ? '' : 'none';
  document.getElementById('ldAddCareEventBtn').style.display = canUpdate() ? '' : 'none';
  new bootstrap.Modal(document.getElementById('litterDetailModal')).show();
  try {
    const litters = await api('/litters');
    const litter = litters.find(l => l.litter_log_id === litterLogId);
    _ldLitter = litter || null;
    if (litter) {
      const age = litterAgeDays(litter);
      const ageBit = age != null ? ` · Day ${age}` : '';
      document.getElementById('ldSummary').innerHTML =
        `<strong>${litter.litter_id || '—'}</strong> · ${fmtDate(litter.litter_date)}${ageBit} ·
         Jill: ${litter.jill_name} · Kits: ${litter.kit_count ?? '—'} ·
         Stillborn: ${litter.stillborn ?? 0} · Infant Deaths: ${litter.infant_deaths ?? 0} ·
         Created: ${litter.individuals_created ?? 0} / ${litterCreatableCount(litter)}`;
    } else {
      document.getElementById('ldSummary').textContent = 'Litter not found.';
    }
    renderLitterCareActions(litter);
    await Promise.all([refreshKitDeathTable(), refreshCareEventTable()]);
  } catch (err) {
    document.getElementById('ldSummary').innerHTML = `<span class="text-danger">${err.message}</span>`;
  }
}

async function refreshKitDeathTable() {
  const tbody = document.getElementById('ldKitDeathTable');
  try {
    const rows = await api(`/litters/${_ldLitterId}/kit-deaths`);
    tbody.innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td>${fmtDate(r.death_date)}</td>
        <td><span class="badge bg-danger-subtle text-danger border border-danger-subtle">${KIT_DEATH_CAUSE_LABELS[r.cause_category] || r.cause_category}</span></td>
        <td class="small">${r.notes || '—'}</td>
        <td class="small">${r.treatments || '—'}</td>
        <td class="text-muted small">${r.recorded_by || '—'}</td>
        <td>${roleIs('admin') ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteKitDeath(${r.kit_death_id})"><i class="bi bi-trash"></i></button>` : ''}</td>
      </tr>`).join('') : `<tr><td colspan="6" class="text-muted text-center py-3">No kit deaths logged</td></tr>`;
  } catch (err) { tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center py-2">${err.message}</td></tr>`; }
}

async function refreshCareEventTable() {
  const tbody = document.getElementById('ldCareEventTable');
  try {
    const rows = await api(`/litters/${_ldLitterId}/care-events`);
    tbody.innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td>${fmtDate(r.event_date)}</td>
        <td><span class="badge bg-secondary">${CARE_EVENT_TYPE_LABELS[r.event_type] || r.event_type}</span></td>
        <td>${r.weight_grams != null ? r.weight_grams + ' g' : '—'}</td>
        <td>${r.kit_count ?? '—'}</td>
        <td>${r.feed_type || '—'}</td>
        <td class="small">${r.notes || '—'}</td>
        <td class="text-muted small">${r.recorded_by || '—'}</td>
        <td>${roleIs('admin') ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteCareEvent(${r.care_event_id})"><i class="bi bi-trash"></i></button>` : ''}</td>
      </tr>`).join('') : `<tr><td colspan="8" class="text-muted text-center py-3">No care events logged</td></tr>`;
  } catch (err) { tbody.innerHTML = `<tr><td colspan="8" class="text-danger text-center py-2">${err.message}</td></tr>`; }
}

function openKitDeathModal() {
  document.getElementById('kdLitterId').value = _ldLitterId;
  document.getElementById('kdDate').value = today();
  document.getElementById('kdCause').value = 'unknown';
  document.getElementById('kdNotes').value = '';
  document.getElementById('kdTreatments').value = '';
  new bootstrap.Modal(document.getElementById('kitDeathModal')).show();
}

async function submitKitDeath() {
  const litterLogId = document.getElementById('kdLitterId').value;
  const death_date = document.getElementById('kdDate').value;
  if (!death_date) return alert('Date of death is required.');
  try {
    await api(`/litters/${litterLogId}/kit-deaths`, {
      method: 'POST', body: {
        death_date,
        cause_category: document.getElementById('kdCause').value,
        notes: document.getElementById('kdNotes').value || null,
        treatments: document.getElementById('kdTreatments').value || null
      }
    });
    bootstrap.Modal.getInstance(document.getElementById('kitDeathModal')).hide();
    await refreshKitDeathTable();
    loadLitters();
    if (_currentFerretId) loadFerretDetail(_currentFerretId);
  } catch (err) { alert(err.message); }
}

async function deleteKitDeath(deathId) {
  if (!confirm('Delete this kit death record?')) return;
  try {
    await api(`/litters/${_ldLitterId}/kit-deaths/${deathId}`, { method: 'DELETE' });
    await refreshKitDeathTable();
    loadLitters();
  } catch (err) { alert(err.message); }
}

function onCareEventTypeChange() {
  const type = document.getElementById('ceType').value;
  document.getElementById('ceWeightRow').style.display = type === 'weight' ? '' : 'none';
  document.getElementById('ceFeedTypeRow').style.display = type === 'supplemental_feeding' ? '' : 'none';
  document.getElementById('ceKitCountRow').style.display = (type === 'weight' || type === 'supplemental_feeding') ? '' : 'none';
}

function openCareEventModal() {
  document.getElementById('ceLitterId').value = _ldLitterId;
  document.getElementById('ceType').value = 'weight';
  document.getElementById('ceDate').value = today();
  document.getElementById('ceWeight').value = '';
  document.getElementById('ceFeedType').value = '';
  document.getElementById('ceKitCount').value = '';
  document.getElementById('ceNotes').value = '';
  onCareEventTypeChange();
  new bootstrap.Modal(document.getElementById('careEventModal')).show();
}

async function submitCareEvent() {
  const litterLogId = document.getElementById('ceLitterId').value;
  const event_date = document.getElementById('ceDate').value;
  if (!event_date) return alert('Date is required.');
  try {
    await api(`/litters/${litterLogId}/care-events`, {
      method: 'POST', body: {
        event_type: document.getElementById('ceType').value,
        event_date,
        weight_grams: document.getElementById('ceWeight').value || null,
        kit_count: document.getElementById('ceKitCount').value || null,
        feed_type: document.getElementById('ceFeedType').value || null,
        notes: document.getElementById('ceNotes').value || null
      }
    });
    bootstrap.Modal.getInstance(document.getElementById('careEventModal')).hide();
    await refreshCareEventTable();
  } catch (err) { alert(err.message); }
}

async function deleteCareEvent(eventId) {
  if (!confirm('Delete this care event?')) return;
  try {
    await api(`/litters/${_ldLitterId}/care-events/${eventId}`, { method: 'DELETE' });
    await refreshCareEventTable();
  } catch (err) { alert(err.message); }
}

async function printLitterCareLog() {
  if (!_ldLitterId) return alert('Open a care log first.');
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  try {
    const [deaths, events] = await Promise.all([
      api(`/litters/${_ldLitterId}/kit-deaths`),
      api(`/litters/${_ldLitterId}/care-events`)
    ]);
    const l = _ldLitter || {};
    const now = new Date();
    const deathRows = (deaths || []).map(r =>
      '<tr><td>' + esc(fmtDate(r.death_date)) + '</td><td>' +
      esc(KIT_DEATH_CAUSE_LABELS[r.cause_category] || r.cause_category) +
      '</td><td>' + esc(r.notes || '—') + '</td><td>' + esc(r.treatments || '—') +
      '</td><td>' + esc(r.recorded_by || '—') + '</td></tr>'
    ).join('') || '<tr><td colspan="5">No kit deaths logged</td></tr>';
    const careRows = (events || []).map(r =>
      '<tr><td>' + esc(fmtDate(r.event_date)) + '</td><td>' +
      esc(CARE_EVENT_TYPE_LABELS[r.event_type] || r.event_type) +
      '</td><td>' + esc(r.weight_grams != null ? r.weight_grams + ' g' : '—') +
      '</td><td>' + esc(r.kit_count ?? '—') + '</td><td>' + esc(r.feed_type || '—') +
      '</td><td>' + esc(r.notes || '—') + '</td><td>' + esc(r.recorded_by || '—') +
      '</td></tr>'
    ).join('') || '<tr><td colspan="7">No care events logged</td></tr>';
    if (typeof openPrintSheet !== 'function') return alert('Print helper not loaded.');
    openPrintSheet('Care log ' + (l.litter_id || _ldLitterId),
      '<h1>Litter Care Log</h1>' +
      '<div class="meta"><strong>' + esc(l.litter_id || '—') + '</strong> · ' +
      esc(fmtDate(l.litter_date)) + ' · Jill: ' + esc(l.jill_name || '—') +
      ' · Father: ' + esc(l.father || '—') + ' · Kits: ' + esc(l.kit_count ?? '—') +
      ' · Stillborn: ' + esc(l.stillborn ?? 0) + ' · Kit deaths: ' + esc(l.infant_deaths ?? 0) +
      ' · Individuals: ' + esc(l.individuals_created ?? 0) + '</div>' +
      '<h2>Kit deaths (born alive, pre-ID)</h2>' +
      '<table><thead><tr><th>Date</th><th>Cause</th><th>Notes</th><th>Treatments</th><th>By</th></tr></thead>' +
      '<tbody>' + deathRows + '</tbody></table>' +
      '<h2>Care events</h2>' +
      '<table><thead><tr><th>Date</th><th>Type</th><th>Weight</th><th>Kits</th><th>Feed</th><th>Notes</th><th>By</th></tr></thead>' +
      '<tbody>' + careRows + '</tbody></table>' +
      '<p class="meta" style="margin-top:12px">Generated ' + esc(now.toLocaleString()) + '</p>');
  } catch (err) {
    alert(err.message || String(err));
  }
}

function weanWindowOpen(l) {
  const age = litterAgeDays(l);
  return age != null && age >= 42;
}

function refreshMaternityBoards() {
  if (typeof loadLitters === 'function') loadLitters();
  if (typeof loadDashLitters === 'function') loadDashLitters();
}

function renderLitterCareActions(litter) {
  const el = document.getElementById('ldMaternityActions');
  if (!el) return;
  if (!litter) { el.innerHTML = ''; return; }
  const creatable = litterCreatableCount(litter);
  const created = Number(litter.individuals_created || 0);
  const remaining = Math.max(0, creatable - created);
  const grouped = isLitterStillGrouped(litter);
  const age = litterAgeDays(litter);
  const weanOpen = weanWindowOpen(litter);
  const bits = [];
  if (canUpdate() && weanOpen && remaining > 0) {
    bits.push(`<button class="btn btn-sm btn-success" onclick="openCreateFromLitter(${litter.litter_log_id})"><i class="bi bi-egg me-1"></i>Create Ferrets (${remaining} left)</button>`);
  } else if (remaining > 0) {
    const wait = age == null ? '' : ` · day ${age}, opens d42`;
    bits.push(`<span class="badge bg-secondary-subtle text-secondary border">Create Ferrets at wean/chip window${wait}</span>`);
  } else if (creatable > 0) {
    bits.push(`<span class="badge bg-success-subtle text-success border">All kits created</span>`);
  }
  if (canUpdate() && grouped) {
    bits.push(`<button class="btn btn-sm btn-outline-secondary" onclick="markLitterSeparated(${litter.litter_log_id})"><i class="bi bi-arrows-angle-expand me-1"></i>All kits separated</button>`);
  } else if (!grouped) {
    bits.push(`<span class="badge bg-secondary">Separated${litter.kits_separated_at ? ' ' + fmtDate(litter.kits_separated_at) : ''}</span>`);
  }
  el.innerHTML = bits.length ? `<div class="d-flex flex-wrap gap-2 align-items-center mb-3">${bits.join('')}</div>` : '';
}

async function markLitterSeparated(litterLogId) {
  const litter = (_ldLitter && _ldLitter.litter_log_id === litterLogId) ? _ldLitter : null;
  const leftover = litter ? Math.max(0, litterCreatableCount(litter) - Number(litter.individuals_created || 0)) : 0;
  const extra = leftover > 0 ? `\n\n${leftover} kit(s) have not been created as ferrets yet.` : '';
  if (!confirm('Mark all kits in this litter as separated?\n\nThis takes the litter off Active Litters and maternity tasks on the dashboard. It stays in Reports.' + extra)) return;
  try {
    await api(`/litters/${litterLogId}/separate`, { method: 'POST', body: {} });
    refreshMaternityBoards();
    if (_ldLitterId === litterLogId) openLitterDetailModal(litterLogId);
  } catch (err) { alert(err.message); }
}

// ─── Mating Restrictions ──────────────────────────────────────────────────────
async function saveMatingRestriction(ferretId) {
  const flags = [...document.querySelectorAll('.mr-flag:checked')].map(el => el.value);
  const otherText = flags.includes('other')
    ? (document.getElementById('matingRestrictionText')?.value.trim() || '')
    : '';
  try {
    await api(`/ferrets/${ferretId}/mating-restriction`, {
      method: 'PUT', body: {
        mating_restriction_flags: flags.length ? flags.join(',') : null,
        mating_restriction: otherText || null
      }
    });
    document.getElementById('matingRestrictionSaved').style.display = '';
    setTimeout(() => { const el = document.getElementById('matingRestrictionSaved'); if (el) el.style.display = 'none'; }, 2500);
  } catch (err) { alert(err.message); }
}