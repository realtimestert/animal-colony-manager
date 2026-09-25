/**
 * Coefficient of Inbreeding (CoI / F) and Coefficient of Relationship (R).
 * Wright’s path method with memoization. Browser demo build — IIFE so
 * internals (especially `api`) do not collide with app-core.js.
 */
(function (global) {
  'use strict';

  const UNKNOWN_PARENT_NAMES = new Set([
    'unknown', 'unk', 'n/a', 'na', 'none', '?', '-', 'not recorded', 'not known'
  ]);

  function isUnknownParentName(name) {
    if (name == null) return true;
    const s = String(name).trim().toLowerCase();
    return !s || UNKNOWN_PARENT_NAMES.has(s);
  }

  async function buildPedigree(source) {
    let rows;
    if (Array.isArray(source)) {
      rows = source;
    } else if (source && typeof source.query === 'function') {
      const [r] = await source.query(`
        SELECT Ferret_QR005_id AS id,
               animal_id,
               ferret_name AS name,
               sex,
               birth_date,
               mother_id,
               father_id,
               acquisition_class,
               dead,
               distributed
        FROM ferret_qr005
      `);
      rows = r;
    } else {
      rows = [];
    }

    const byId = new Map();
    for (const row of rows) {
      byId.set(row.id, {
        id: row.id,
        animal_id: row.animal_id,
        name: row.name,
        sex: row.sex,
        birth_date: row.birth_date,
        mother_id: row.mother_id || null,
        father_id: row.father_id || null,
        acquisition_class: row.acquisition_class,
        dead: row.dead,
        distributed: row.distributed,
      });
    }

    for (const [id, node] of byId) {
      if (node.mother_id === id) node.mother_id = null;
      if (node.father_id === id) node.father_id = null;
      if (node.mother_id && !byId.has(node.mother_id)) node.mother_id = null;
      if (node.father_id && !byId.has(node.father_id)) node.father_id = null;
      if (node.mother_id) {
        const mom = byId.get(node.mother_id);
        if (!mom || isUnknownParentName(mom.name)) node.mother_id = null;
      }
      if (node.father_id) {
        const dad = byId.get(node.father_id);
        if (!dad || isUnknownParentName(dad.name)) node.father_id = null;
      }
    }

    return {
      byId,
      _fCache: new Map(),
      _phiCache: new Map(),
    };
  }

  function clearCaches(graph) {
    graph._fCache.clear();
    graph._phiCache.clear();
  }

  function coancestry(graph, a, b) {
    if (a == null || b == null) return 0;
    if (a === b) {
      return 0.5 * (1 + inbreedingCoefficient(graph, a));
    }

    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = lo + ':' + hi;
    if (graph._phiCache.has(key)) return graph._phiCache.get(key);

    const nodeA = graph.byId.get(a);
    const nodeB = graph.byId.get(b);
    if (!nodeA || !nodeB) {
      graph._phiCache.set(key, 0);
      return 0;
    }

    let result;
    const dateA = nodeA.birth_date ? new Date(nodeA.birth_date).getTime() : 0;
    const dateB = nodeB.birth_date ? new Date(nodeB.birth_date).getTime() : 0;

    if (dateA > dateB || (dateA === dateB && a > b)) {
      const s = nodeA.father_id;
      const d = nodeA.mother_id;
      result = 0.5 * (coancestry(graph, s, b) + coancestry(graph, d, b));
    } else {
      const s = nodeB.father_id;
      const d = nodeB.mother_id;
      result = 0.5 * (coancestry(graph, a, s) + coancestry(graph, a, d));
    }

    graph._phiCache.set(key, result);
    return result;
  }

  function inbreedingCoefficient(graph, id) {
    if (id == null) return 0;
    if (graph._fCache.has(id)) return graph._fCache.get(id);

    const node = graph.byId.get(id);
    if (!node) {
      graph._fCache.set(id, 0);
      return 0;
    }

    const s = node.father_id;
    const d = node.mother_id;
    let F = 0;
    if (s != null && d != null) {
      F = coancestry(graph, s, d);
    }
    if (F < 1e-12) F = 0;
    if (F > 1) F = 1;

    graph._fCache.set(id, F);
    return F;
  }

  function relationshipCoefficient(graph, id1, id2) {
    if (id1 === id2) return 1;
    const phi = coancestry(graph, id1, id2);
    const Fx = inbreedingCoefficient(graph, id1);
    const Fy = inbreedingCoefficient(graph, id2);
    const denom = Math.sqrt((1 + Fx) * (1 + Fy));
    if (denom === 0) return 0;
    return (2 * phi) / denom;
  }

  function interpretCoi(F) {
    if (F < 0.03125) return { level: 'very_low', label: 'Very low (< 3.125%)', detail: 'Essentially outbred' };
    if (F < 0.0625)  return { level: 'low', label: 'Low (< 6.25%)', detail: '\u2248 second cousins or less' };
    if (F < 0.125)   return { level: 'moderate', label: 'Moderate (6.25\u201312.5%)', detail: '\u2248 first cousins once removed / half first cousins' };
    if (F < 0.25)    return { level: 'notable', label: 'Notable (12.5\u201325%)', detail: '\u2248 first cousins range' };
    if (F < 0.5)     return { level: 'high', label: 'High (25\u201350%)', detail: '\u2248 half-sibs / grandparent\u2013grandchild / uncle\u2013niece' };
    return { level: 'very_high', label: 'Very high (\u2265 50%)', detail: '\u2248 full sibs / parent\u2013offspring or closer' };
  }

  function interpretRelationship(R) {
    if (R >= 0.5) return 'Parent\u2013offspring or full siblings (\u224850%+)';
    if (R >= 0.25) return 'Half-siblings, grandparent\u2013grandchild, or uncle/aunt\u2013niece/nephew (\u224825%)';
    if (R >= 0.125) return 'First cousins or equivalent (\u224812.5%)';
    if (R >= 0.0625) return 'First cousins once removed / second cousins range (\u22486.25%)';
    if (R > 0.01) return 'Distantly related';
    return 'Essentially unrelated';
  }

  function completenessStats(graph) {
    let total = 0, both = 0, one = 0, none = 0;
    const byClass = {};

    for (const node of graph.byId.values()) {
      total++;
      const hasM = node.mother_id != null;
      const hasF = node.father_id != null;
      if (hasM && hasF) both++;
      else if (hasM || hasF) one++;
      else none++;

      const cls = node.acquisition_class || 'Unknown';
      if (!byClass[cls]) byClass[cls] = { total: 0, both: 0, one: 0, none: 0 };
      byClass[cls].total++;
      if (hasM && hasF) byClass[cls].both++;
      else if (hasM || hasF) byClass[cls].one++;
      else byClass[cls].none++;
    }

    return {
      total,
      both_parents: both,
      one_parent: one,
      no_parents: none,
      pct_complete: total ? +(100 * both / total).toFixed(1) : 0,
      by_acquisition_class: byClass,
    };
  }

  function allCoi(graph, opts) {
    opts = opts || {};
    const threshold = opts.threshold || 0;
    const liveOnly = !!opts.liveOnly;
    const rows = [];
    for (const node of graph.byId.values()) {
      if (liveOnly && (node.dead === '1' || node.dead === 1 || node.distributed)) continue;
      const F = inbreedingCoefficient(graph, node.id);
      if (F >= threshold) {
        rows.push({
          id: node.id,
          animal_id: node.animal_id,
          name: node.name,
          sex: node.sex,
          birth_date: node.birth_date,
          mother_id: node.mother_id,
          father_id: node.father_id,
          coi: +F.toFixed(6),
          coi_pct: +(F * 100).toFixed(2),
          interpretation: interpretCoi(F).label,
          acquisition_class: node.acquisition_class,
        });
      }
    }
    rows.sort(function (a, b) { return b.coi - a.coi; });
    return rows;
  }

  const exported = {
    buildPedigree: buildPedigree,
    clearCaches: clearCaches,
    coancestry: coancestry,
    inbreedingCoefficient: inbreedingCoefficient,
    relationshipCoefficient: relationshipCoefficient,
    interpretCoi: interpretCoi,
    interpretRelationship: interpretRelationship,
    completenessStats: completenessStats,
    allCoi: allCoi,
    isUnknownParentName: isUnknownParentName,
  };

  global.SanusGenetics = exported;
})(typeof window !== 'undefined' ? window : globalThis);
