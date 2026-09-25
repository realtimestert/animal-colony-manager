/* Animal Colony Manager — GitHub Pages mock API
   Loads window.ACM_SEED, intercepts /api/*, persists writes in localStorage. */
(function (global) {
  'use strict';

  var STORE_KEY = 'acm_demo_db_v2';
  var TOKEN_KEY = 'sb_token';
  var USER_KEY = 'sb_user';
  var DEMO_TOKEN = 'demo-admin-token';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function iso(d) {
    if (!d) return null;
    if (typeof d === 'string') return d.slice(0, 10);
    var x = new Date(d);
    if (isNaN(x.getTime())) return null;
    var m = x.getMonth() + 1, day = x.getDate();
    return x.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function today() { return iso(new Date()); }
  function addDays(dateStr, n) {
    var d = new Date((dateStr || today()) + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  function daysBetween(a, b) {
    if (!a) return null;
    return Math.floor((new Date((b || today()) + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
  }
  function ageWeeks(birth, end) {
    var d = daysBetween(birth, end || today());
    return d == null ? null : Math.round((d / 7) * 10) / 10;
  }
  function num(v) { return v == null || v === '' ? null : Number(v); }

  function normalizeSeed(raw) {
    raw = raw || {};
    var ferrets = (raw.ferrets || []).map(function (f) {
      var row = Object.assign({}, f);
      row.id = num(row.id) || num(row.Ferret_QR005_id);
      row.Ferret_QR005_id = row.id;
      row.ferret_name = row.ferret_name || row.name;
      row.name = row.name || row.ferret_name;
      row.dead = String(row.dead == null ? '0' : row.dead);
      row.distributed = row.distributed ? 1 : 0;
      row.in_research = row.in_research ? 1 : 0;
      row.archived = row.archived ? 1 : 0;
      row.needs_bath = row.needs_bath ? 1 : 0;
      row.needs_nail_trim = row.needs_nail_trim ? 1 : 0;
      row.eight_hour_light = row.eight_hour_light ? 1 : 0;
      row.breeding_retired = row.breeding_retired ? 1 : 0;
      return row;
    });
    var health = (raw.health_events || []).map(function (h) {
      var row = Object.assign({}, h);
      if (row.weight_grams == null && row.weight != null) row.weight_grams = row.weight;
      if (row.weight == null && row.weight_grams != null) row.weight = row.weight_grams;
      return row;
    });
    var vaccs = (raw.vaccinations || []).map(function (v) {
      var row = Object.assign({}, v);
      row.vaccination_date = row.vaccination_date || row.event_date;
      row.event_date = row.event_date || row.vaccination_date;
      return row;
    });
    var repro = (raw.reproductive_events || []).map(function (e) {
      var row = Object.assign({}, e);
      row.event_id = row.event_id || row.repro_id;
      row.repro_id = row.event_id;
      row.pulled_date = row.pulled_date || null;
      return row;
    });
    var vet = (raw.vet_communications || []).map(function (c) {
      var row = Object.assign({}, c);
      row.kind = row.kind || row.direction || 'note';
      row.question = row.question || row.subject || '';
      row.answer = row.answer || row.body || '';
      row.follow_up_date = row.follow_up_date || null;
      row.follow_up_done = row.follow_up_done ? 1 : 0;
      return row;
    });
    var settings = Object.assign({
      id: 1,
      nail_trim_interval_days: 180,
      bath_interval_days: 180,
      weight_warn_days: 30,
      weight_critical_days: 45
    }, raw.care_schedule || {});
    if (raw.care_schedule && raw.care_schedule.nail_interval_days && !settings.nail_trim_interval_days) {
      settings.nail_trim_interval_days = raw.care_schedule.nail_interval_days;
    }
    var roomsMap = {};
    (raw.addresses || []).forEach(function (a) {
      if (!roomsMap[a.room_id]) roomsMap[a.room_id] = { room_id: a.room_id, room_name: a.room_name, room_lighting: a.room_lighting };
    });
    return {
      users: raw.users || [],
      addresses: raw.addresses || [],
      rooms: Object.keys(roomsMap).map(function (k) { return roomsMap[k]; }),
      suppliers: raw.suppliers || [],
      distributors: raw.distributors || [],
      ferrets: ferrets,
      rfids: raw.rfid_assignments || [],
      health: health,
      vaccs: vaccs,
      litters: raw.litters || [],
      careEvents: raw.litter_care_events || [],
      kitDeaths: raw.kit_deaths || [],
      repro: repro,
      deaths: raw.death_records || [],
      deathNotes: raw.death_notes || [],
      deathPhotos: raw.death_photos || [],
      studies: raw.research_studies || [],
      assignments: raw.research_assignments || [],
      distEvents: raw.distribution_events || [],
      vetComms: vet,
      examNotes: raw.exam_notes || [],
      locationHistory: raw.location_history || [],
      lightHistory: raw.light_history || [],
      history: raw.activity_log || [],
      settings: settings
    };
  }

  function demoUser() {
    var seed = global.ACM_SEED || {};
    var u = (seed.users || []).find(function (x) { return x.role === 'admin'; }) || {
      user_id: 1, username: 'demo', full_name: 'Demo Admin', role: 'admin'
    };
    return { user_id: u.user_id, username: u.username, full_name: u.full_name, role: u.role };
  }

  var USER = demoUser();
  try {
    localStorage.setItem(TOKEN_KEY, DEMO_TOKEN);
    localStorage.setItem(USER_KEY, JSON.stringify(USER));
  } catch (e) {}

  function loadDb() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.ferrets && parsed.ferrets.length) return parsed;
      }
    } catch (e) {}
    return normalizeSeed(global.ACM_SEED);
  }
  function saveDb() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) {}
  }

  var db = loadDb();

  function ferretById(id) {
    id = Number(id);
    return db.ferrets.find(function (f) { return Number(f.id) === id; });
  }
  function addrOf(f) {
    return db.addresses.find(function (a) { return a.address_id === f.address_id; }) || {
      cage_address: f.cage_address, room_id: f.room_id, room_name: f.room_name, room_lighting: f.room_lighting
    };
  }
  function lastRepro(id) {
    var ev = db.repro.filter(function (e) { return Number(e.ferret_id) === Number(id); });
    ev.sort(function (a, b) {
      if (a.event_date === b.event_date) return (b.event_id || 0) - (a.event_id || 0);
      return a.event_date < b.event_date ? 1 : -1;
    });
    return ev[0] || null;
  }
  function listRow(f) {
    var a = addrOf(f);
    var asg = db.assignments.find(function (x) { return x.ferret_id === f.id && !x.ended_at && !x.ended_date; });
    var study = asg ? (db.studies.find(function (s) { return s.study_id === asg.study_id; }) || {}).study_name : null;
    var death = db.deaths.find(function (d) { return d.ferret_id === f.id; });
    return Object.assign({}, f, {
      id: f.id,
      name: f.ferret_name || f.name,
      ferret_name: f.ferret_name || f.name,
      cage_address: a.cage_address || f.cage_address,
      room_id: a.room_id || f.room_id,
      room_name: a.room_name || f.room_name,
      room_lighting: a.room_lighting || f.room_lighting,
      research_study_name: study,
      research_cohort: asg ? asg.cohort : f.research_cohort,
      cause_of_death: (death && death.cause_of_death) || f.cause_of_death
    });
  }
  function deathBundle(id) {
    var rec = db.deaths.find(function (d) { return Number(d.ferret_id) === Number(id); });
    if (!rec) return null;
    var notes = db.deathNotes.filter(function (n) { return n.death_id === rec.death_id; }).map(function (n) {
      return {
        note_id: n.note_id,
        note_text: n.notes || n.note_text || '',
        performed_at: n.performed_at || n.created_at,
        performed_by: n.performed_by || n.created_by,
        created_at: n.created_at
      };
    });
    return {
      cause_of_death: rec.cause_of_death,
      death_date: rec.death_date,
      food_water_access: rec.food_water_access,
      cage_mate_affected: rec.cage_mates_healthy || rec.cage_mate_affected,
      notes: notes,
      photos: db.deathPhotos.filter(function (p) { return p.death_id === rec.death_id; })
    };
  }
  function detailRow(f) {
    var row = listRow(f);
    row.death = deathBundle(f.id);
    var asg = db.assignments.find(function (x) { return x.ferret_id === f.id && !x.ended_at && !x.ended_date; });
    if (asg) {
      var st = db.studies.find(function (s) { return s.study_id === asg.study_id; }) || {};
      row.research = {
        assignment_id: asg.assignment_id,
        cohort: asg.cohort,
        assigned_date: asg.assigned_date,
        assignment_notes: asg.notes || asg.outcome,
        study_id: asg.study_id,
        study_name: st.study_name || '',
        sponsor: st.sponsor || ''
      };
    } else row.research = null;
    return row;
  }
  function nextId(arr, key) {
    var max = 0;
    (arr || []).forEach(function (r) { var n = Number(r[key]); if (n > max) max = n; });
    return max + 1;
  }
  function logAct(action, ferretId, details) {
    db.history.unshift({
      log_id: nextId(db.history, 'log_id'),
      activity_id: nextId(db.history, 'log_id'),
      user_id: USER.user_id,
      username: USER.username,
      full_name: USER.full_name,
      action: action,
      table_name: 'ferret_qr005',
      record_id: ferretId,
      ferret_id: ferretId,
      details: details,
      created_at: new Date().toISOString()
    });
  }

  function jsonResp(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  function activeTasks() {
    var t = today();
    var out = [];
    db.litters.forEach(function (ll) {
      if (ll.kits_separated_at) return;
      if (ll.surviving_litter_count != null && ll.surviving_litter_count <= 0) return;
      if (!ll.litter_date) return;
      var ageDays = daysBetween(ll.litter_date, t);
      if (ageDays == null || ageDays < 0) return;
      var ageWeeks = Math.round((ageDays / 7) * 10) / 10;
      if (ageWeeks >= 8) return;
      var jill = ferretById(ll.Ferret_QR005_id || ll.jill_id);
      var a = jill ? addrOf(jill) : {};
      var lastNest = ll.nest_litter_changed;
      var nextNestDue = lastNest ? addDays(lastNest, 14) : addDays(ll.litter_date, 14);
      var lastWeigh = ll.last_weigh_date;
      var nextWeighDue = lastWeigh ? addDays(lastWeigh, 7) : (ageDays >= 7 ? addDays(ll.litter_date, 7) : null);
      out.push(Object.assign({}, ll, {
        ferret_id: ll.Ferret_QR005_id || ll.jill_id,
        jill_name: ll.jill_name || (jill && jill.ferret_name),
        jill_animal_id: jill && jill.animal_id,
        room_id: a.room_id, cage_address: a.cage_address, room_lighting: a.room_lighting, room_name: a.room_name,
        age_days: ageDays, age_weeks: ageWeeks,
        soft_food_start: addDays(ll.litter_date, 21),
        soft_food_active: ageDays >= 21 && ageDays < 42,
        soft_food_due_soon: ageDays >= 18 && ageDays < 21,
        wean_date: addDays(ll.litter_date, 42),
        wean_window_open: ageDays >= 42,
        wean_due_soon: ageDays >= 39 && ageDays < 42,
        next_nest_due: nextNestDue,
        nest_overdue: nextNestDue && nextNestDue < t,
        nest_due_soon: nextNestDue && nextNestDue >= t && daysBetween(t, nextNestDue) <= 3,
        next_weigh_due: nextWeighDue,
        weigh_overdue: nextWeighDue && nextWeighDue < t,
        weigh_due_soon: nextWeighDue && nextWeighDue >= t && daysBetween(t, nextWeighDue) <= 2
      }));
    });
    return out;
  }

  function careAlerts() {
    var s = db.settings;
    var alerts = [];
    db.ferrets.filter(function (f) { return f.dead !== '1' && !f.distributed && !f.archived; }).forEach(function (f) {
      var weights = db.health.filter(function (h) { return h.ferret_id === f.id && h.event_type === 'weight'; })
        .sort(function (a, b) { return a.event_date < b.event_date ? 1 : -1; });
      var baths = db.health.filter(function (h) { return h.ferret_id === f.id && h.event_type === 'bath'; })
        .sort(function (a, b) { return a.event_date < b.event_date ? 1 : -1; });
      var nails = db.health.filter(function (h) { return h.ferret_id === f.id && h.event_type === 'nail_trim'; })
        .sort(function (a, b) { return a.event_date < b.event_date ? 1 : -1; });
      var lastW = weights[0] ? weights[0].event_date : null;
      var lastB = baths[0] ? baths[0].event_date : null;
      var lastN = nails[0] ? nails[0].event_date : null;
      var weightDays = lastW ? daysBetween(lastW, today()) : null;
      var bathDays = lastB ? daysBetween(lastB, today()) : null;
      var nailDays = lastN ? daysBetween(lastN, today()) : null;
      var ageD = f.birth_date ? daysBetween(f.birth_date, today()) : null;
      var weight_status = 'ok';
      if (weightDays == null) weight_status = 'never';
      else if (weightDays >= (s.weight_critical_days || 45)) weight_status = 'red';
      else if (weightDays >= (s.weight_warn_days || 30)) weight_status = 'yellow';
      var nail_status = 'ok';
      var nailInt = s.nail_trim_interval_days || s.nail_interval_days || 180;
      if (nailDays == null) { if (ageD != null && ageD >= nailInt) nail_status = 'overdue'; }
      else if (nailDays >= nailInt) nail_status = 'overdue';
      if (f.needs_nail_trim == 1 && nail_status === 'ok') nail_status = 'requested';
      var bath_status = 'ok';
      if (f.needs_bath == 1) {
        var flagged = f.needs_bath_at ? daysBetween(f.needs_bath_at, today()) : 0;
        bath_status = flagged >= 7 ? 'overdue' : 'this_week';
      }
      if (weight_status === 'ok' && nail_status === 'ok' && bath_status === 'ok') return;
      var a = addrOf(f);
      alerts.push({
        id: f.id, name: f.ferret_name, animal_id: f.animal_id,
        room_id: a.room_id, room_name: a.room_name, cage_address: a.cage_address,
        last_weight_date: lastW, weight_days: weightDays, weight_status: weight_status,
        last_bath_date: lastB, bath_days: bathDays, bath_status: bath_status,
        last_nail_trim_date: lastN, nail_days: nailDays, nail_status: nail_status,
        needs_bath: f.needs_bath == 1, needs_bath_at: f.needs_bath_at,
        needs_nail_trim: f.needs_nail_trim == 1, needs_nail_trim_at: f.needs_nail_trim_at
      });
    });
    return { settings: s, ferrets: alerts };
  }

  function genetics() { return global.SanusGenetics || null; }

  function handle(method, pathname, q, body) {
    method = (method || 'GET').toUpperCase();
    body = body || {};
    q = q || new URLSearchParams();
    var path = pathname.replace(/^.*\/api/, '');
    if (path.charAt(0) !== '/') path = '/' + path;
    var m, id, f;

    if (path === '/login' && method === 'POST') {
      var users = (global.ACM_SEED && global.ACM_SEED.users) || db.users || [];
      var found = users.find(function (u) {
        return u.username === body.username && (!u.password || u.password === body.password);
      });
      if (!found) return jsonResp({ error: 'Invalid credentials' }, 401);
      var tokenUser = { user_id: found.user_id, username: found.username, full_name: found.full_name, role: found.role };
      try {
        localStorage.setItem(TOKEN_KEY, DEMO_TOKEN);
        localStorage.setItem(USER_KEY, JSON.stringify(tokenUser));
      } catch (e) {}
      return jsonResp({ token: DEMO_TOKEN, user: tokenUser });
    }
    if (path === '/me') return jsonResp(USER);
    if (path === '/version') return jsonResp({ version: '2.2-demo', name: 'Animal Colony Manager' });

    if (path === '/dashboard') {
      var total = db.ferrets.filter(function (x) { return x.dead !== '1' && !x.distributed && !x.in_research && !x.distribution_tag && !x.archived; }).length;
      var on_research = db.ferrets.filter(function (x) { return x.dead !== '1' && x.in_research && !x.archived; }).length;
      var pending_distribution = db.ferrets.filter(function (x) { return x.dead !== '1' && !x.distributed && !x.in_research && x.distribution_tag && !x.archived; }).length;
      var vacc_due = db.ferrets.filter(function (x) {
        return x.dead !== '1' && !x.distributed && !x.archived && x.next_rabies_vaccine_due && x.next_rabies_vaccine_due <= addDays(today(), 30);
      }).length;
      var monthStart = today().slice(0, 8) + '01';
      var litters_this_month = db.litters.filter(function (l) { return l.litter_date >= monthStart; }).length;
      return jsonResp({
        total: total, on_research: on_research, pending_distribution: pending_distribution,
        vacc_due: vacc_due, litters_this_month: litters_this_month,
        recent_activity: db.history.slice(0, 10)
      });
    }

    if (path === '/females/estrus') {
      var rows = db.ferrets.filter(function (x) {
        if (x.sex !== 'female' || x.dead === '1' || x.distributed || x.in_research || x.distribution_tag || x.breeding_retired) return false;
        var ev = lastRepro(x.id);
        if (!ev) return false;
        if (ev.event_type === 'no_litter' || ev.event_type === 'weaned') return false;
        if (ev.event_type === 'littered' && daysBetween(ev.event_date, today()) >= 120) return false;
        return true;
      }).map(function (x) {
        var ev = lastRepro(x.id);
        var a = addrOf(x);
        return {
          id: x.id, name: x.ferret_name, animal_id: x.animal_id, birth_date: x.birth_date,
          weight: x.weight, color: x.color, photo_url: x.photo_url, female_status: x.female_status,
          room_id: a.room_id, room_name: a.room_name, cage_address: a.cage_address, room_lighting: a.room_lighting,
          status_event_id: ev.event_id, status: ev.event_type, status_since: ev.event_date,
          pulled_date: ev.pulled_date, status_notes: ev.notes,
          expected_litter_start: ev.event_type === 'mated' ? addDays(ev.event_date, 42) : null,
          expected_litter_end: ev.event_type === 'mated' && ev.pulled_date ? addDays(ev.pulled_date, 42) : null
        };
      });
      return jsonResp(rows);
    }

    if (path === '/females/died-on-board') {
      var cutoff = addDays(today(), -7);
      return jsonResp(db.ferrets.filter(function (x) {
        return x.sex === 'female' && x.dead === '1' && x.death_date && x.death_date >= cutoff && x.death_female_status;
      }).map(function (x) {
        var a = addrOf(x);
        return { id: x.id, name: x.ferret_name, animal_id: x.animal_id, birth_date: x.birth_date, death_date: x.death_date, death_female_status: x.death_female_status, room_id: a.room_id, room_name: a.room_name, cage_address: a.cage_address };
      }));
    }

    m = path.match(/^\/rfid\/lookup\/(.+)$/);
    if (m) {
      var input = decodeURIComponent(m[1]).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      if (input.length < 5) return jsonResp({ error: 'Please enter at least the last 5 digits of the RFID chip.' }, 400);
      var hits = db.rfids.filter(function (r) {
        if (r.unassigned_date) return false;
        return String(r.rfid).toUpperCase().slice(-input.length) === input;
      });
      var ids = [];
      hits.forEach(function (h) { if (ids.indexOf(h.ferret_id) < 0) ids.push(h.ferret_id); });
      if (!hits.length) return jsonResp({ error: 'unassigned' }, 404);
      if (ids.length > 1) return jsonResp({ error: 'Multiple active chips share those digits. Please enter more digits of the RFID chip.' }, 409);
      f = ferretById(hits[0].ferret_id);
      return jsonResp(Object.assign({}, listRow(f), { rfid: hits[0].rfid, assigned_date: hits[0].assigned_date, reason: hits[0].reason, notes: hits[0].notes }));
    }

    if (path === '/ferrets/care-alerts') return jsonResp(careAlerts());
    if (path === '/care-schedule') {
      if (method === 'GET') return jsonResp(db.settings);
      Object.assign(db.settings, body);
      saveDb();
      return jsonResp(db.settings);
    }
    if (path === '/ferrets/vaccinations-due') {
      var days = Number(q.get('days') || 30);
      return jsonResp(db.ferrets.filter(function (x) {
        return x.dead !== '1' && !x.distributed && !x.archived && x.next_rabies_vaccine_due && x.next_rabies_vaccine_due <= addDays(today(), days);
      }).map(function (x) {
        var a = addrOf(x);
        return { id: x.id, name: x.ferret_name, animal_id: x.animal_id, next_rabies_vaccine_due: x.next_rabies_vaccine_due, room_id: a.room_id, room_name: a.room_name, cage_address: a.cage_address };
      }));
    }
    if (path === '/ferrets/light-cycle-boards') {
      var into = [], outof = [];
      db.ferrets.filter(function (x) { return x.dead !== '1' && !x.distributed && !x.archived && x.sex === 'female'; }).forEach(function (x) {
        var row = { id: x.id, name: x.ferret_name, animal_id: x.animal_id, weeks: ageWeeks(x.light_state_since || x.birth_date), eight_hour_light: x.eight_hour_light, light_state_since: x.light_state_since };
        if (x.eight_hour_light) into.push(row); else outof.push(row);
      });
      return jsonResp({ into_dark: into, out_of_dark: outof, females_into_dark: into, females_out_of_dark: outof });
    }

    if (path === '/ferrets' || path.indexOf('/ferrets?') === 0) {
      if (method === 'GET') {
        var search = (q.get('search') || '').toLowerCase();
        return jsonResp(db.ferrets.filter(function (x) {
          if (!search) return true;
          return String(x.ferret_name).toLowerCase().indexOf(search) >= 0 || String(x.animal_id).indexOf(search) >= 0 || String(x.name).toLowerCase().indexOf(search) >= 0;
        }).map(listRow));
      }
      if (method === 'POST') {
        id = nextId(db.ferrets, 'id');
        var created = Object.assign({
          Ferret_QR005_id: id, id: id, dead: '0', distributed: 0, in_research: 0, archived: 0,
          photo_url: null, eight_hour_light: 0, needs_bath: 0, needs_nail_trim: 0, breeding_retired: 0,
          acquisition_class: 'Littered', color: 'sable', weight: body.weight || 0
        }, body, {
          id: id, Ferret_QR005_id: id,
          ferret_name: body.ferret_name || body.name || ('New ' + id),
          name: body.ferret_name || body.name || ('New ' + id),
          animal_id: body.animal_id || (10000 + id)
        });
        db.ferrets.push(created);
        logAct('CREATE', id, 'Added ' + created.ferret_name);
        saveDb();
        return jsonResp({ id: id, animal_id: created.animal_id });
      }
    }

    m = path.match(/^\/ferrets\/(\d+)(?:\/(.+))?$/);
    if (m) {
      id = Number(m[1]);
      f = ferretById(id);
      var sub = m[2] || '';
      if (!f && method === 'GET' && !sub) return jsonResp({ error: 'Ferret not found' }, 404);

      if (!sub && method === 'GET') return jsonResp(detailRow(f));
      if (!sub && method === 'PUT') {
        ['ferret_name', 'name', 'birth_date', 'death_date', 'sex', 'color', 'description', 'weight', 'next_rabies_vaccine_due'].forEach(function (k) {
          if (body[k] !== undefined) f[k] = body[k];
        });
        if (body.ferret_name) f.name = body.ferret_name;
        saveDb();
        return jsonResp({ ok: true });
      }

      if (sub === 'health' && method === 'GET') {
        return jsonResp(db.health.filter(function (h) { return h.ferret_id === id; }).sort(function (a, b) { return a.event_date < b.event_date ? 1 : -1; }));
      }
      if (sub === 'vaccinations' && method === 'GET') {
        return jsonResp(db.vaccs.filter(function (v) { return v.ferret_id === id; }).sort(function (a, b) { return (a.event_date || '') < (b.event_date || '') ? 1 : -1; }));
      }
      if (sub === 'litters' && method === 'GET') {
        return jsonResp(db.litters.filter(function (l) { return Number(l.Ferret_QR005_id || l.jill_id) === id; }));
      }
      if (sub === 'litters-as-father' && method === 'GET') {
        return jsonResp(db.litters.filter(function (l) { return Number(l.father_id || l.hob_id) === id; }));
      }
      if (sub === 'history' && method === 'GET') {
        return jsonResp(db.history.filter(function (h) { return Number(h.ferret_id || h.record_id) === id; }));
      }
      if (sub === 'reproductive' && method === 'GET') {
        return jsonResp(db.repro.filter(function (e) { return e.ferret_id === id; }).sort(function (a, b) { return a.event_date < b.event_date ? 1 : -1; }));
      }
      if (sub === 'reproductive' && method === 'POST') {
        var ev = { event_id: nextId(db.repro, 'event_id'), repro_id: null, ferret_id: id, event_type: body.event_type, event_date: body.event_date || today(), partner_id: body.partner_id || null, pulled_date: body.pulled_date || null, notes: body.notes || '', recorded_by: USER.username };
        ev.repro_id = ev.event_id;
        db.repro.push(ev);
        f.female_status = body.event_type;
        logAct('REPRO_EVENT', id, body.event_type + ' for ' + f.ferret_name);
        saveDb();
        return jsonResp(ev);
      }
      if (sub === 'exam-notes' && method === 'GET') return jsonResp(db.examNotes.filter(function (n) { return n.ferret_id === id; }));
      if (sub === 'exam-notes' && method === 'POST') {
        var note = { exam_note_id: nextId(db.examNotes, 'exam_note_id'), ferret_id: id, exam_date: body.exam_date || today(), notes: body.notes || '', weight_grams: body.weight_grams || null, recorded_by: USER.username };
        db.examNotes.push(note); saveDb(); return jsonResp(note);
      }
      if (sub === 'matings' && method === 'GET') {
        return jsonResp(db.repro.filter(function (e) { return e.ferret_id === id && e.event_type === 'mated'; }));
      }
      if (sub === 'vet-communications' && method === 'GET') return jsonResp(db.vetComms.filter(function (c) { return c.ferret_id === id; }));
      if (sub === 'vet-communications' && method === 'POST') {
        var comm = { comm_id: nextId(db.vetComms, 'comm_id'), ferret_id: id, kind: body.kind || 'note', question: body.question || body.subject || '', answer: body.answer || body.body || '', comm_date: body.comm_date || today(), follow_up_date: body.follow_up_date || null, follow_up_done: 0, recorded_by: USER.username };
        db.vetComms.push(comm); saveDb(); return jsonResp(comm);
      }
      var vc = sub.match(/^vet-communications\/(\d+)$/);
      if (vc && method === 'PATCH') {
        var c = db.vetComms.find(function (x) { return Number(x.comm_id) === Number(vc[1]); });
        if (c) Object.assign(c, body);
        saveDb(); return jsonResp(c || { ok: true });
      }
      if (sub === 'rfid' && method === 'GET') return jsonResp(db.rfids.filter(function (r) { return r.ferret_id === id; }));
      if (sub === 'rfid' && method === 'POST') {
        db.rfids.forEach(function (r) { if (r.ferret_id === id && !r.unassigned_date) r.unassigned_date = today(); });
        var chip = { rfid_id: nextId(db.rfids, 'rfid_id'), ferret_id: id, rfid: String(body.rfid).trim(), assigned_date: today(), unassigned_date: null, reason: body.reason || 'assign', notes: body.notes || '' };
        db.rfids.push(chip); saveDb(); return jsonResp(chip);
      }
      if (sub === 'rfid/unassign' && (method === 'PUT' || method === 'POST')) {
        db.rfids.forEach(function (r) { if (r.ferret_id === id && !r.unassigned_date) r.unassigned_date = today(); });
        saveDb(); return jsonResp({ ok: true });
      }
      if (sub === 'location-history') return jsonResp(db.locationHistory.filter(function (h) { return h.ferret_id === id; }));
      if (sub === 'light-history') return jsonResp(db.lightHistory.filter(function (h) { return h.ferret_id === id; }));
      if (sub === 'research' && method === 'GET') {
        var asg = db.assignments.filter(function (x) { return x.ferret_id === id; });
        return jsonResp(asg);
      }
      if (sub === 'research' && method === 'POST') {
        f.in_research = 1; f.distribution_tag = null;
        db.assignments.push({ assignment_id: nextId(db.assignments, 'assignment_id'), ferret_id: id, study_id: body.study_id || 1, cohort: body.cohort || 'unassigned', assigned_date: today(), ended_at: null, notes: body.notes || '' });
        logAct('RESEARCH_ASSIGN', id, 'Assigned ' + f.ferret_name); saveDb(); return jsonResp({ ok: true });
      }
      if (sub === 'research/end' && method === 'POST') {
        f.in_research = 0;
        db.assignments.forEach(function (x) { if (x.ferret_id === id && !x.ended_at && !x.ended_date) { x.ended_at = today(); x.outcome = body.outcome || 'reintegrated'; } });
        saveDb(); return jsonResp({ ok: true });
      }
      if (sub === 'distribution-tag' && method === 'POST') {
        f.distribution_tag = body.tag || body.distribution_tag || 'offsite';
        f.distribution_tag_dest = body.dest || body.distribution_tag_dest || '';
        f.distribution_tagged_at = today();
        f.distribution_tag_notes = body.notes || '';
        saveDb(); return jsonResp({ ok: true });
      }
      if (sub === 'distribution-tag' && (method === 'DELETE' || method === 'PUT')) {
        f.distribution_tag = null; f.distribution_tag_dest = null; f.distribution_tagged_at = null; f.distribution_tag_notes = null;
        saveDb(); return jsonResp({ ok: true });
      }
      if (sub === 'distribute' && method === 'POST') {
        f.distributed = 1; f.distribution_date = body.distribution_date || today(); f.distribution_tag = null; f.in_research = 0;
        db.distEvents.push({ distribution_id: nextId(db.distEvents, 'distribution_id'), ferret_id: id, ferret_name: f.ferret_name, animal_id: f.animal_id, sex: f.sex, distribution_date: f.distribution_date, distributor_name: body.distributor_name || 'Demo distributor', dist_notes: body.notes || '', recorded_by: USER.username });
        saveDb(); return jsonResp({ ok: true });
      }
      if (sub === 'distribute/undo' && method === 'POST') { f.distributed = 0; f.distribution_date = null; saveDb(); return jsonResp({ ok: true }); }
      if (sub === 'distribution' && method === 'GET') return jsonResp(db.distEvents.filter(function (e) { return e.ferret_id === id; }));
      if (sub === 'death' && method === 'GET') return jsonResp(deathBundle(id) || {});
      if ((sub === 'death' || sub === 'deceased') && (method === 'POST' || method === 'PUT')) {
        f.dead = '1'; f.death_date = body.death_date || today(); f.cause_of_death = body.cause_of_death || body.cause || 'Unknown';
        f.death_female_status = f.female_status || null;
        var rec = db.deaths.find(function (d) { return d.ferret_id === id; });
        if (!rec) {
          rec = { death_id: nextId(db.deaths, 'death_id'), ferret_id: id };
          db.deaths.push(rec);
        }
        rec.death_date = f.death_date; rec.cause_of_death = f.cause_of_death;
        rec.food_water_access = body.food_water_access || 'yes';
        rec.cage_mates_healthy = body.cage_mate_affected || body.cage_mates_healthy || 'unknown';
        if (body.notes || body.note_text) {
          db.deathNotes.push({ note_id: nextId(db.deathNotes, 'note_id'), death_id: rec.death_id, notes: body.notes || body.note_text, created_at: today(), created_by: USER.username, performed_at: body.performed_at || today(), performed_by: body.performed_by || USER.full_name });
        }
        logAct('DEATH', id, 'Marked ' + f.ferret_name + ' deceased'); saveDb(); return jsonResp({ ok: true });
      }
      if (sub === 'death/notes' && method === 'POST') {
        var drec = db.deaths.find(function (d) { return d.ferret_id === id; });
        if (!drec) { drec = { death_id: nextId(db.deaths, 'death_id'), ferret_id: id, cause_of_death: f.cause_of_death, death_date: f.death_date }; db.deaths.push(drec); }
        var dn = { note_id: nextId(db.deathNotes, 'note_id'), death_id: drec.death_id, notes: body.notes || body.note_text || '', created_at: today(), created_by: USER.username, performed_at: body.performed_at || today(), performed_by: body.performed_by || USER.full_name };
        db.deathNotes.push(dn); saveDb(); return jsonResp(dn);
      }
      if (sub === 'archive' && method === 'POST') { f.archived = 1; f.archived_at = today(); f.archived_by = USER.username; saveDb(); return jsonResp({ ok: true }); }
      if (sub === 'restore' && method === 'POST') { f.archived = 0; f.archived_at = null; saveDb(); return jsonResp({ ok: true }); }
      if (sub === 'care-need' && method === 'PUT') {
        if (body.bath !== undefined) { f.needs_bath = body.bath ? 1 : 0; f.needs_bath_at = body.bath ? today() : null; }
        if (body.nail !== undefined) { f.needs_nail_trim = body.nail ? 1 : 0; f.needs_nail_trim_at = body.nail ? today() : null; }
        saveDb(); return jsonResp({ ok: true });
      }
      if (sub === 'light-cycle' && method === 'PUT') {
        f.eight_hour_light = body.eight_hour_light ? 1 : 0;
        f.light_state_since = body.since || today();
        saveDb(); return jsonResp({ ok: true });
      }
      if (sub === 'no-litter' && method === 'POST') {
        db.repro.push({ event_id: nextId(db.repro, 'event_id'), ferret_id: id, event_type: 'no_litter', event_date: body.event_date || today(), notes: body.notes || '', recorded_by: USER.username });
        f.female_status = null; saveDb(); return jsonResp({ ok: true });
      }
      if (sub === 'print' && method === 'POST') { logAct('PRINT', id, 'Printed ' + f.ferret_name); saveDb(); return jsonResp({ ok: true }); }
      if (sub === 'photo/original') return jsonResp({ error: 'No original photo in the static demo' }, 404);
      if (sub.indexOf('reproductive/') === 0) {
        var rest = sub.split('/');
        var eid = Number(rest[1]);
        var evn = db.repro.find(function (e) { return Number(e.event_id) === eid; });
        if (rest[2] === 'partner' && evn) { evn.partner_id = body.partner_id; saveDb(); return jsonResp(evn); }
        if (rest[2] === 'pulled-date' && evn) { evn.pulled_date = body.pulled_date; saveDb(); return jsonResp(evn); }
        if (method === 'DELETE' && evn) { db.repro = db.repro.filter(function (e) { return e !== evn; }); saveDb(); return jsonResp({ ok: true }); }
        return jsonResp(evn || { ok: true });
      }
      if (method === 'DELETE' && !sub) {
        db.ferrets = db.ferrets.filter(function (x) { return x.id !== id; });
        saveDb(); return jsonResp({ ok: true });
      }
      return jsonResp({ ok: true });
    }

    if (path === '/health-events' && method === 'POST') {
      var he = { health_event_id: nextId(db.health, 'health_event_id'), ferret_id: Number(body.ferret_id), event_type: body.event_type || 'weight', event_date: body.event_date || today(), weight: body.weight || body.weight_grams || null, weight_grams: body.weight || body.weight_grams || null, notes: body.notes || '', recorded_by: USER.username };
      db.health.push(he);
      var ff = ferretById(he.ferret_id);
      if (ff && he.weight) ff.weight = he.weight;
      if (he.event_type === 'bath' && ff) { ff.needs_bath = 0; ff.needs_bath_at = null; }
      if (he.event_type === 'nail_trim' && ff) { ff.needs_nail_trim = 0; ff.needs_nail_trim_at = null; }
      saveDb(); return jsonResp(he);
    }
    m = path.match(/^\/health-events\/(\d+)$/);
    if (m) {
      var hid = Number(m[1]);
      if (method === 'PUT') {
        var hr = db.health.find(function (h) { return h.health_event_id === hid; });
        if (hr) Object.assign(hr, body);
        saveDb(); return jsonResp(hr || { ok: true });
      }
      if (method === 'DELETE') { db.health = db.health.filter(function (h) { return h.health_event_id !== hid; }); saveDb(); return jsonResp({ ok: true }); }
    }
    if (path === '/vaccinations' && method === 'POST') {
      var vv = { vaccination_id: nextId(db.vaccs, 'vaccination_id'), ferret_id: Number(body.ferret_id), vaccine_type: body.vaccine_type || 'rabies', event_date: body.event_date || body.vaccination_date || today(), vaccination_date: body.event_date || body.vaccination_date || today(), next_due: body.next_due || addDays(today(), 365), notes: body.notes || '', administered_by: USER.username };
      db.vaccs.push(vv);
      var fv = ferretById(vv.ferret_id);
      if (fv && vv.vaccine_type === 'rabies') fv.next_rabies_vaccine_due = vv.next_due;
      saveDb(); return jsonResp(vv);
    }

    if (path === '/batch-events/candidates') {
      var kind = q.get('kind') || 'bath';
      var cands = db.ferrets.filter(function (x) { return x.dead !== '1' && !x.distributed && !x.archived; }).map(function (x) {
        var a = addrOf(x);
        return { id: x.id, name: x.ferret_name, animal_id: x.animal_id, room_id: a.room_id, room_name: a.room_name, cage_address: a.cage_address, next_rabies_vaccine_due: x.next_rabies_vaccine_due, needs_bath: x.needs_bath, needs_nail_trim: x.needs_nail_trim };
      });
      return jsonResp(cands);
    }
    if (path === '/batch-events' && method === 'POST') {
      var ids = body.ferret_ids || body.ids || [];
      var kind2 = body.kind || body.event_type || 'bath';
      var date = body.event_date || today();
      ids.forEach(function (fid) {
        fid = Number(fid);
        var fx = ferretById(fid);
        if (!fx) return;
        if (kind2 === 'vaccination' || kind2 === 'rabies') {
          db.vaccs.push({ vaccination_id: nextId(db.vaccs, 'vaccination_id'), ferret_id: fid, vaccine_type: 'rabies', event_date: date, vaccination_date: date, next_due: addDays(date, 365), notes: 'batch', administered_by: USER.username });
          fx.next_rabies_vaccine_due = addDays(date, 365);
        } else {
          db.health.push({ health_event_id: nextId(db.health, 'health_event_id'), ferret_id: fid, event_type: kind2, event_date: date, notes: 'batch', recorded_by: USER.username });
          if (kind2 === 'bath') { fx.needs_bath = 0; fx.needs_bath_at = null; }
          if (kind2 === 'nail_trim') { fx.needs_nail_trim = 0; fx.needs_nail_trim_at = null; }
        }
      });
      saveDb();
      return jsonResp({ ok: true, count: ids.length });
    }

    if (path === '/litters/active-tasks') return jsonResp(activeTasks());
    if (path === '/litters/next-id') {
      var maxLit = 0;
      db.litters.forEach(function (l) {
        var n = parseInt(String(l.litter_id || '').replace(/\D/g, ''), 10);
        if (n > maxLit) maxLit = n;
      });
      var next = 'LIT' + String(maxLit + 1).padStart(4, '0');
      return jsonResp({ litter_id: next });
    }
    if (path === '/litters' || path.indexOf('/litters?') === 0) {
      if (method === 'GET') return jsonResp(db.litters.slice().sort(function (a, b) { return a.litter_date < b.litter_date ? 1 : -1; }));
      if (method === 'POST') {
        var lid = nextId(db.litters, 'litter_log_id');
        var jill = ferretById(body.Ferret_QR005_id || body.ferret_id || body.jill_id);
        var row = Object.assign({
          litter_log_id: lid, litter_id: body.litter_id, litter_date: body.litter_date || today(),
          Ferret_QR005_id: body.Ferret_QR005_id || body.ferret_id, jill_id: body.Ferret_QR005_id || body.ferret_id,
          jill_name: jill ? jill.ferret_name : body.jill_name, father: body.father, father_id: body.father_id || body.hob_id,
          kit_count: body.kit_count || 0, stillborn: body.stillborn || 0, infant_deaths: body.infant_deaths || 0,
          surviving_litter_count: body.surviving_litter_count != null ? body.surviving_litter_count : (body.kit_count || 0),
          individuals_created: 0, kits_separated_at: null, anomalies_and_notes: body.notes || body.anomalies_and_notes || '',
          created_by: USER.username
        }, body);
        db.litters.unshift(row);
        if (jill) jill.female_status = 'littered';
        logAct('LITTER', row.Ferret_QR005_id, 'Recorded ' + row.litter_id);
        saveDb(); return jsonResp(row);
      }
    }
    m = path.match(/^\/litters\/(\d+)(?:\/(.+))?$/);
    if (m) {
      var llid = Number(m[1]);
      var litter = db.litters.find(function (l) { return Number(l.litter_log_id) === llid; });
      var lsub = m[2] || '';
      if (!litter) return jsonResp({ error: 'Litter not found' }, 404);
      if (!lsub && method === 'GET') return jsonResp(litter);
      if (!lsub && method === 'PUT') { Object.assign(litter, body); saveDb(); return jsonResp(litter); }
      if (lsub === 'separate' && method === 'POST') {
        litter.kits_separated_at = today();
        saveDb(); return jsonResp({ ok: true });
      }
      if (lsub === 'create-ferrets' && method === 'POST') {
        var kits = body.kits || body.ferrets || [];
        var made = [];
        kits.forEach(function (k) {
          var nid = nextId(db.ferrets, 'id');
          var nf = {
            id: nid, Ferret_QR005_id: nid, ferret_name: k.ferret_name || k.name, name: k.ferret_name || k.name,
            animal_id: k.animal_id || (10000 + nid), sex: k.sex || null, birth_date: litter.litter_date,
            weight: k.weight || 0, color: k.color || 'sable', dead: '0', distributed: 0, in_research: 0, archived: 0,
            mother_id: litter.Ferret_QR005_id || litter.jill_id, father_id: litter.father_id,
            mother_name: litter.jill_name, father_name: litter.father, litter_id: litter.litter_id,
            acquisition_class: 'Littered', photo_url: null, needs_bath: 0, needs_nail_trim: 0
          };
          db.ferrets.push(nf); made.push(nf);
        });
        litter.individuals_created = (litter.individuals_created || 0) + made.length;
        saveDb(); return jsonResp({ created: made.length, ids: made.map(function (x) { return x.id; }) });
      }
      if (lsub === 'kit-deaths' && method === 'GET') return jsonResp(db.kitDeaths.filter(function (k) { return k.litter_log_id === llid; }));
      if (lsub === 'kit-deaths' && method === 'POST') {
        var kd = Object.assign({ kit_death_id: nextId(db.kitDeaths, 'kit_death_id'), litter_log_id: llid, death_date: body.death_date || today(), notes: body.notes || '', recorded_by: USER.username }, body);
        db.kitDeaths.push(kd);
        litter.infant_deaths = (litter.infant_deaths || 0) + (kd.count || 1);
        saveDb(); return jsonResp(kd);
      }
      if (lsub.indexOf('kit-deaths/') === 0 && method === 'DELETE') {
        var kdid = Number(lsub.split('/')[1]);
        db.kitDeaths = db.kitDeaths.filter(function (k) { return k.kit_death_id !== kdid; });
        saveDb(); return jsonResp({ ok: true });
      }
      if (lsub === 'care-events' && method === 'GET') return jsonResp(db.careEvents.filter(function (e) { return e.litter_log_id === llid; }));
      if (lsub === 'care-events' && method === 'POST') {
        var ce = Object.assign({ care_event_id: nextId(db.careEvents, 'care_event_id'), litter_log_id: llid, event_date: body.event_date || today(), recorded_by: USER.username }, body);
        db.careEvents.push(ce);
        if (ce.event_type === 'weigh') litter.last_weigh_date = ce.event_date;
        saveDb(); return jsonResp(ce);
      }
      if (lsub.indexOf('care-events/') === 0 && method === 'DELETE') {
        var ceid = Number(lsub.split('/')[1]);
        db.careEvents = db.careEvents.filter(function (e) { return e.care_event_id !== ceid; });
        saveDb(); return jsonResp({ ok: true });
      }
      return jsonResp({ ok: true });
    }

    if (path === '/stats/overview') {
      var live = db.ferrets.filter(function (x) { return x.dead !== '1' && !x.distributed && !x.archived; });
      var females = live.filter(function (x) { return x.sex === 'female'; }).length;
      var males = live.filter(function (x) { return x.sex === 'male'; }).length;
      var both = 0, one = 0, none = 0;
      live.forEach(function (x) {
        var hm = !!x.mother_id, hf = !!x.father_id;
        if (hm && hf) both++; else if (hm || hf) one++; else none++;
      });
      var cohorts = {};
      live.forEach(function (x) {
        if (!x.birth_date) return;
        var y = x.birth_date.slice(0, 4);
        if (!cohorts[y]) cohorts[y] = { birth_year: Number(y), females: 0, males: 0, total: 0 };
        cohorts[y].total++;
        if (x.sex === 'female') cohorts[y].females++;
        if (x.sex === 'male') cohorts[y].males++;
      });
      var bm = 0, bf = 0;
      live.forEach(function (x) {
        if (x.in_research || x.distribution_tag || x.breeding_retired) return;
        var aw = ageWeeks(x.birth_date);
        if (aw == null || aw > 240) return;
        if (x.sex === 'male' && aw >= 25) bm++;
        if (x.sex === 'female' && (aw >= 20 || x.female_status)) bf++;
      });
      return jsonResp({
        live: { total: live.length, females: females, males: males, unknown_sex: live.length - females - males, littered: live.filter(function (x) { return x.acquisition_class === 'Littered'; }).length, sourced: live.filter(function (x) { return x.acquisition_class === 'Sourced'; }).length, sex_ratio_f_to_m: males ? Math.round((females / males) * 100) / 100 : null },
        pedigree: { total: live.length, both_parents: both, one_parent: one, no_parents: none, pct_complete: live.length ? Math.round(1000 * both / live.length) / 10 : 0 },
        active_breeding: { males: bm, females: bf, total: bm + bf },
        sex_ratio_by_cohort: Object.keys(cohorts).sort().reverse().map(function (k) { return cohorts[k]; })
      });
    }
    if (path === '/stats/population-pyramid') {
      var bins = [];
      var s0 = 0;
      while (s0 < 256) { bins.push({ bin_start: s0, bin_end: s0 + 8, bin_label: s0 + '–' + (s0 + 7), male: 0, female: 0, unknown: 0, total: 0 }); s0 += 8; }
      bins.push({ bin_start: 256, bin_end: null, bin_label: '256+', male: 0, female: 0, unknown: 0, total: 0 });
      db.ferrets.filter(function (x) { return x.dead !== '1' && !x.distributed && x.birth_date; }).forEach(function (x) {
        var aw = ageWeeks(x.birth_date);
        if (aw == null) return;
        var idx = bins.findIndex(function (b) { return b.bin_end == null ? aw >= b.bin_start : aw >= b.bin_start && aw < b.bin_end; });
        if (idx < 0) idx = bins.length - 1;
        bins[idx].total++;
        if (x.sex === 'male') bins[idx].male++;
        else if (x.sex === 'female') bins[idx].female++;
        else bins[idx].unknown++;
      });
      var grand = bins.reduce(function (s, b) { return s + b.total; }, 0) || 1;
      bins.forEach(function (b) {
        b.pct_male = Math.round((b.male / grand) * 1000) / 10;
        b.pct_female = Math.round((b.female / grand) * 1000) / 10;
        b.pct_total = Math.round((b.total / grand) * 1000) / 10;
      });
      return jsonResp({ as_of: today(), total_animals: grand === 1 && bins.every(function (b) { return b.total === 0; }) ? 0 : grand, bins: bins });
    }
    if (path === '/stats/age-list') {
      var minW = q.get('min_age_weeks') != null ? parseFloat(q.get('min_age_weeks')) : null;
      var maxW = q.get('max_age_weeks') != null ? parseFloat(q.get('max_age_weeks')) : null;
      var sex = q.get('sex');
      var list = db.ferrets.filter(function (x) {
        if (q.get('status') !== 'all' && (x.dead === '1' || x.distributed)) return false;
        var aw = ageWeeks(x.birth_date);
        if (minW != null && (aw == null || aw < minW)) return false;
        if (maxW != null && (aw == null || aw >= maxW)) return false;
        if (sex && x.sex !== sex) return false;
        return true;
      }).map(function (x) {
        var rfid = (db.rfids.find(function (r) { return r.ferret_id === x.id && !r.unassigned_date; }) || {}).rfid;
        return Object.assign(listRow(x), { age_weeks: ageWeeks(x.birth_date), rfid: rfid });
      });
      return jsonResp(list);
    }
    if (path === '/stats/death-summary') {
      var dead = db.ferrets.filter(function (x) { return x.dead === '1'; });
      function stageOf(w) { if (w == null) return 'adult'; if (w < 26) return 'kit'; if (w < 52) return 'juvenile'; return 'adult'; }
      var ages = dead.map(function (x) { return ageWeeks(x.birth_date, x.death_date); }).filter(function (w) { return w != null; });
      var by = { kit: { count: 0, ages: [] }, juvenile: { count: 0, ages: [] }, adult: { count: 0, ages: [] } };
      ages.forEach(function (w) { var s = stageOf(w); by[s].count++; by[s].ages.push(w); });
      function avg(a) { return a.length ? Math.round(a.reduce(function (s, v) { return s + v; }, 0) / a.length * 10) / 10 : null; }
      function med(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); var m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10; }
      var causes = {};
      dead.forEach(function (x) { var c = x.cause_of_death || 'Unknown'; causes[c] = (causes[c] || 0) + 1; });
      var years = {};
      dead.forEach(function (x) {
        if (!x.death_date) return;
        var y = x.death_date.slice(0, 4);
        if (!years[y]) years[y] = { year: y, deaths: 0, ages: [] };
        years[y].deaths++;
        var w = ageWeeks(x.birth_date, x.death_date);
        if (w != null) years[y].ages.push(w);
      });
      var mort = Object.keys(years).sort().reverse().map(function (y) {
        var atRisk = db.ferrets.filter(function (x) {
          if (!x.birth_date) return false;
          var by = Number(x.birth_date.slice(0, 4));
          var dy = x.death_date ? Number(x.death_date.slice(0, 4)) : 9999;
          return by <= Number(y) && dy >= Number(y);
        }).length;
        return { year: y, deaths: years[y].deaths, at_risk: atRisk, death_ratio_pct: atRisk ? Math.round(years[y].deaths / atRisk * 1000) / 10 : null, avg_age_weeks: avg(years[y].ages) };
      });
      return jsonResp({
        total_deaths: dead.length,
        overall: { avg_age_weeks: avg(ages), median_age_weeks: med(ages) },
        by_stage: {
          kit: { count: by.kit.count, avg_age_weeks: avg(by.kit.ages) },
          juvenile: { count: by.juvenile.count, avg_age_weeks: avg(by.juvenile.ages) },
          adult: { count: by.adult.count, avg_age_weeks: avg(by.adult.ages) }
        },
        life_stage_note: 'Infancy <26 wk · adolescence 26–52 wk · adult >52 wk',
        causes: Object.keys(causes).map(function (c) { return { cause: c, count: causes[c] }; }),
        mortality_by_year: mort
      });
    }
    if (path === '/stats/weight-alerts') return jsonResp({ alerts: careAlerts().ferrets.filter(function (x) { return x.weight_status !== 'ok'; }), settings: db.settings });
    if (path === '/stats/reproduction') {
      var jills = {}, hobs = {};
      db.ferrets.forEach(function (x) {
        if (x.mother_id) { jills[x.mother_id] = (jills[x.mother_id] || 0) + 1; }
        if (x.father_id) { hobs[x.father_id] = (hobs[x.father_id] || 0) + 1; }
      });
      function topMap(map) {
        return Object.keys(map).map(function (id) {
          var p = ferretById(id);
          return { id: Number(id), animal_id: p && p.animal_id, name: p ? p.ferret_name : '#' + id, offspring: map[id] };
        }).sort(function (a, b) { return b.offspring - a.offspring; }).slice(0, 8);
      }
      var firstAges = [];
      db.litters.forEach(function (l) {
        var jill = ferretById(l.Ferret_QR005_id || l.jill_id);
        if (jill && jill.birth_date && l.litter_date) {
          var w = ageWeeks(jill.birth_date, l.litter_date);
          if (w != null) firstAges.push(w);
        }
      });
      function avg2(a) { return a.length ? Math.round(a.reduce(function (s, v) { return s + v; }, 0) / a.length * 10) / 10 : null; }
      function med2(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); var m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10; }
      var eligible = db.litters.filter(function (l) { return l.litter_date && daysBetween(l.litter_date, today()) >= 182; });
      var pending = db.litters.filter(function (l) { return l.litter_date && daysBetween(l.litter_date, today()) < 182; }).length;
      var survivingLitters = 0, kitPcts = [], totalLive = 0, totalSurv = 0;
      eligible.forEach(function (l) {
        var liveborn = (l.kit_count || 0) - (l.stillborn || 0);
        var kids = db.ferrets.filter(function (x) { return x.litter_id === l.litter_id && ageWeeks(x.birth_date) >= 26 && x.dead !== '1'; });
        if (kids.length >= 1) survivingLitters++;
        if (liveborn > 0) kitPcts.push(100 * kids.length / liveborn);
        totalLive += Math.max(liveborn, 0);
        totalSurv += kids.length;
      });
      return jsonResp({
        top_jills: topMap(jills), top_hobs: topMap(hobs),
        age_at_first_litter: { count: firstAges.length, avg_weeks: avg2(firstAges), median_weeks: med2(firstAges) },
        litter_stats: {
          litter_count: db.litters.length,
          avg_kits_born: avg2(db.litters.map(function (l) { return Number(l.kit_count || 0); })),
          avg_surviving: avg2(db.litters.map(function (l) { return Number(l.surviving_litter_count || 0); })),
          avg_stillborn: avg2(db.litters.map(function (l) { return Number(l.stillborn || 0); })),
          avg_kit_deaths: avg2(db.litters.map(function (l) { return Number(l.infant_deaths || 0); })),
          total_stillborn: db.litters.reduce(function (s, l) { return s + Number(l.stillborn || 0); }, 0),
          total_kit_deaths: db.litters.reduce(function (s, l) { return s + Number(l.infant_deaths || 0); }, 0)
        },
        six_month_survival: {
          surviving_litters_pct: eligible.length ? Math.round(1000 * survivingLitters / eligible.length) / 10 : null,
          surviving_litter_count: survivingLitters,
          eligible_litter_count: eligible.length,
          pct_kits_surviving_per_litter: kitPcts.length ? Math.round(avg2(kitPcts) * 10) / 10 : null,
          overall_kit_survival_pct: totalLive ? Math.round(1000 * totalSurv / totalLive) / 10 : null,
          total_six_month_survivors: totalSurv,
          total_liveborn: totalLive,
          pending_litter_count: pending
        }
      });
    }

    m = path.match(/^\/stats\/genetics\/coi\/(\d+)$/);
    if (m) {
      var g = genetics();
      if (!g) return jsonResp({ id: Number(m[1]), coi: 0, coi_pct: 0, interpretation: 'Genetics module not loaded' });
      return g.buildPedigree(db.ferrets.map(pedRow)).then(function (graph) {
        var F = g.inbreedingCoefficient(graph, Number(m[1]));
        var interp = g.interpretCoi(F);
        var node = ferretById(m[1]);
        return jsonResp({ id: Number(m[1]), name: node && node.ferret_name, animal_id: node && node.animal_id, coi: +F.toFixed(6), coi_pct: +(F * 100).toFixed(2), interpretation: interp.label, detail: interp.detail });
      });
    }
    if (path === '/stats/genetics/relatedness') {
      var g2 = genetics();
      var a = Number(q.get('a')), b = Number(q.get('b'));
      if (!g2) return jsonResp({ a: a, b: b, r: 0 });
      return g2.buildPedigree(db.ferrets.map(pedRow)).then(function (graph) {
        var R = g2.relationshipCoefficient(graph, a, b);
        var F1 = g2.inbreedingCoefficient(graph, a);
        var F2 = g2.inbreedingCoefficient(graph, b);
        return jsonResp({ a: a, b: b, r: +R.toFixed(4), interpretation: g2.interpretRelationship(R), coi_a: +F1.toFixed(4), coi_b: +F2.toFixed(4) });
      });
    }
    if (path === '/stats/genetics/high-coi') {
      var g3 = genetics();
      var thr = parseFloat(q.get('threshold') || '0');
      if (!g3) return jsonResp([]);
      return g3.buildPedigree(db.ferrets.map(pedRow)).then(function (graph) {
        return jsonResp(g3.allCoi(graph, { threshold: thr, liveOnly: q.get('live_only') === '1' }));
      });
    }
    if (path === '/stats/genetics/export-coi') {
      var g4 = genetics();
      if (!g4) return jsonResp([]);
      return g4.buildPedigree(db.ferrets.map(pedRow)).then(function (graph) {
        var rows = g4.allCoi(graph, { threshold: parseFloat(q.get('threshold') || '0'), liveOnly: q.get('live_only') === '1' });
        var csv = 'id,animal_id,name,sex,coi,coi_pct,interpretation\n' + rows.map(function (r) {
          return [r.id, r.animal_id, r.name, r.sex, r.coi, r.coi_pct, r.interpretation].join(',');
        }).join('\n');
        return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=coi.csv' } });
      });
    }
    if (path === '/stats/genetics/completeness') {
      var live2 = db.ferrets.filter(function (x) { return x.dead !== '1' && !x.distributed; });
      var both2 = live2.filter(function (x) { return x.mother_id && x.father_id; }).length;
      return jsonResp({ total: live2.length, both_parents: both2, pct_complete: live2.length ? Math.round(1000 * both2 / live2.length) / 10 : 0 });
    }

    if (path === '/reports/ferrets-by-room') {
      var byRoom = {};
      db.ferrets.filter(function (x) { return x.dead !== '1' && !x.distributed && !x.archived; }).forEach(function (x) {
        var a = addrOf(x);
        var key = (a.room_name || 'Unassigned') + '|' + (a.cage_address || '');
        if (!byRoom[key]) byRoom[key] = { room_name: a.room_name, room_id: a.room_id, cage_address: a.cage_address, ferrets: [] };
        byRoom[key].ferrets.push({ id: x.id, name: x.ferret_name, animal_id: x.animal_id, sex: x.sex });
      });
      return jsonResp(Object.keys(byRoom).map(function (k) { return byRoom[k]; }));
    }
    if (path === '/reports/deaths') {
      return jsonResp(db.ferrets.filter(function (x) { return x.dead === '1'; }).map(function (x) {
        return { id: x.id, name: x.ferret_name, animal_id: x.animal_id, death_date: x.death_date, cause_of_death: x.cause_of_death, sex: x.sex };
      }));
    }
    if (path === '/reports/infant-mortality') {
      return jsonResp({ kit_deaths: db.kitDeaths.slice(), stillborns: db.litters.filter(function (l) { return l.stillborn > 0; }) });
    }
    if (path === '/distribution-events' || path.indexOf('/distribution-events?') === 0) return jsonResp(db.distEvents.slice());
    if (path === '/research/studies') return jsonResp(db.studies.slice());
    if (path === '/research/assignments' || path.indexOf('/research/assignments') === 0) return jsonResp(db.assignments.slice());
    if (path === '/rooms') return jsonResp(db.rooms);
    if (path === '/addresses') return jsonResp(db.addresses);
    if (path === '/suppliers') return jsonResp(db.suppliers);
    if (path === '/distributors') return jsonResp(db.distributors);
    if (path === '/users' || path === '/users/names') return jsonResp(db.users.map(function (u) { return { user_id: u.user_id, username: u.username, full_name: u.full_name, role: u.role }; }));
    if (path === '/activity-log' || path.indexOf('/activity-log') === 0) return jsonResp(db.history.slice(0, 100));

    if (path.indexOf('/vet-communications/') === 0 && method === 'DELETE') {
      var cid = Number(path.split('/')[2]);
      db.vetComms = db.vetComms.filter(function (c) { return Number(c.comm_id) !== cid; });
      saveDb(); return jsonResp({ ok: true });
    }

    if (method === 'GET') return jsonResp([]);
    return jsonResp({ ok: true, demo: true });
  }

  function pedRow(f) {
    return { id: f.id, animal_id: f.animal_id, name: f.ferret_name || f.name, sex: f.sex, birth_date: f.birth_date, mother_id: f.mother_id, father_id: f.father_id, acquisition_class: f.acquisition_class, dead: f.dead, distributed: f.distributed };
  }

  global.ACM = {
    resetDemo: function () {
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      location.reload();
    },
    db: function () { return db; }
  };

  var origFetch = global.fetch.bind(global);
  global.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var u;
      try { u = new URL(url, global.location ? location.href : 'http://localhost/'); }
      catch (e) { return origFetch(input, init); }
      if (u.pathname.indexOf('/api/') === -1 && !/\/api$/.test(u.pathname)) return origFetch(input, init);
      init = init || {};
      var method = (init.method || 'GET').toUpperCase();
      var body = {};
      if (init.body && typeof FormData !== 'undefined' && init.body instanceof FormData) {
        init.body.forEach(function (v, k) { body[k] = v; });
      } else if (init.body && typeof init.body === 'string') {
        try { body = JSON.parse(init.body); } catch (e) { body = {}; }
      }
      return Promise.resolve(handle(method, u.pathname, u.searchParams, body)).catch(function (err) {
        console.error('mock-api', method, u.pathname, err);
        return jsonResp({ error: err.message || String(err) }, 500);
      });
    } catch (err) {
      return origFetch(input, init);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
