// Animal Colony Manager demo — app-stats.js
// Updated for historical population pyramid (date/year, SPF/imported, side-by-side)

let _statsTab = 'overview';
let _statsAgeResults = [];
let _pyramidChart = null;

function loadStatistics() {
  switchStatsTab(_statsTab || 'overview');
}

function switchStatsTab(tab) {
  _statsTab = tab;
  document.querySelectorAll('#statsTabs .nav-link').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.statsTab === tab);
  });
  document.querySelectorAll('.stats-panel').forEach(p => {
    p.style.display = p.id === 'stats-' + tab ? '' : 'none';
  });

  if (tab === 'overview') loadStatsOverview();
  else if (tab === 'age') { /* wait for Apply */ }
  else if (tab === 'population') loadStatsPopulation();
  else if (tab === 'health') loadStatsHealth();
  else if (tab === 'genetics') loadStatsGenetics();
  else if (tab === 'reproduction') loadStatsReproduction();
}

// ... (rest of file unchanged up to Population Pyramid section)

// ── Population Pyramid ──────────────────────────────────────────────
function _pyramidParams() {
  const asOf = document.getElementById('pyramidAsOf')?.value || '';
  const spf = document.getElementById('pyramidSpf')?.checked ? '1' : '';
  const imported = document.getElementById('pyramidImported')?.checked ? '1' : '';
  const p = new URLSearchParams();
  if (asOf) p.set('as_of', asOf);
  if (spf) p.set('spf', spf);
  if (imported) p.set('imported', imported);
  return p.toString();
}

async function loadStatsPopulation() {
  const cardsEl = document.getElementById('statsPopCards');
  if (cardsEl) cardsEl.innerHTML = '<div class="col-12 text-center text-muted py-2"><div class="spinner-border spinner-border-sm"></div></div>';

  // Populate year dropdown once (2023 to current)
  const yearSel = document.getElementById('pyramidYear');
  if (yearSel && yearSel.options.length <= 1) {
    const thisYear = new Date().getFullYear();
    for (let y = thisYear; y >= 2023; y--) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearSel.appendChild(opt);
    }
    yearSel.onchange = () => {
      const y = yearSel.value;
      if (y) {
        const asOf = document.getElementById('pyramidAsOf');
        if (asOf) asOf.value = y + '-12-31';
      }
    };
  }

  const applyBtn = document.getElementById('pyramidApply');
  if (applyBtn && !applyBtn._bound) {
    applyBtn._bound = true;
    applyBtn.onclick = loadStatsPopulation;
  }

  try {
    const qs = _pyramidParams();
    const data = await api('/stats/population-pyramid' + (qs ? '?' + qs : ''));
    const bins = data.bins || [];
    const total = data.total_animals || 0;

    const asOf2 = document.getElementById('pyramidAsOf2')?.value || '';
    let data2 = null;
    if (asOf2) {
      const p2 = new URLSearchParams(_pyramidParams());
      p2.set('as_of', asOf2);
      data2 = await api('/stats/population-pyramid?' + p2.toString());
    }

    if (cardsEl) {
      const males = bins.reduce((s, b) => s + b.male, 0);
      const females = bins.reduce((s, b) => s + b.female, 0);
      let cardsHtml = `
        <div class="col-md-4"><div class="card"><div class="card-body text-center">
          <div class="fs-4 fw-bold">${total}</div><div class="text-muted small">Animals in pyramid</div>
        </div></div></div>
        <div class="col-md-4"><div class="card"><div class="card-body text-center">
          <div class="fs-4 fw-bold">${females} ♀ · ${males} ♂</div><div class="text-muted small">Sex split</div>
        </div></div></div>
        <div class="col-md-4"><div class="card"><div class="card-body text-center">
          <div class="fs-4 fw-bold">8-wk bins · 256+</div><div class="text-muted small">As of ${data.as_of || 'today'}</div>
        </div></div></div>`;
      if (data2) {
        const t2 = data2.total_animals || 0;
        cardsHtml += `
        <div class="col-md-4"><div class="card"><div class="card-body text-center">
          <div class="fs-4 fw-bold">${t2}</div><div class="text-muted small">Comparison total</div>
        </div></div></div>`;
      }
      cardsEl.innerHTML = cardsHtml;
    }

    const label1 = document.getElementById('pyramidAsOfLabel');
    if (label1) label1.textContent = 'As of ' + (data.as_of || 'today') + ' · 8-week bins · 256+';
    renderPyramidChart(bins, 'pyramidChart');

    const compareCol = document.getElementById('pyramidCompareCol');
    if (data2 && compareCol) {
      compareCol.style.display = '';
      const label2 = document.getElementById('pyramidAsOf2Label');
      if (label2) label2.textContent = 'As of ' + (data2.as_of || asOf2);
      renderPyramidChart(data2.bins || [], 'pyramidChart2', true);
    } else if (compareCol) {
      compareCol.style.display = 'none';
    }

    const listCard = document.getElementById('pyramidListCard');
    if (listCard) listCard.style.display = 'none';
  } catch (err) {
    if (cardsEl) cardsEl.innerHTML = `<div class="col-12"><div class="alert alert-danger">${err.message}</div></div>`;
  }
}

let _pyramidBins = [];

function renderPyramidChart(bins, canvasId = 'pyramidChart', noClick = false) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;

  if (canvasId === 'pyramidChart') _pyramidBins = bins.slice();
  const labels = bins.map(b => b.bin_label).reverse();
  const maleData = bins.map(b => -b.male).reverse();
  const femaleData = bins.map(b => b.female).reverse();

  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Male',
          data: maleData,
          backgroundColor: 'rgba(54, 162, 235, 0.75)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1,
          borderSkipped: false
        },
        {
          label: 'Female',
          data: femaleData,
          backgroundColor: 'rgba(255, 99, 132, 0.75)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 1,
          borderSkipped: false
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      onClick: noClick ? undefined : function(evt, elements) {
        if (!elements.length) return;
        const el = elements[0];
        const reversed = _pyramidBins.slice().reverse();
        const bin = reversed[el.index];
        if (!bin) return;
        const sex = el.datasetIndex === 0 ? 'male' : 'female';
        loadPyramidBinList(bin, sex);
      },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = Math.abs(ctx.raw);
              return `${ctx.dataset.label}: ${v}`;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: false,
          ticks: {
            callback(val) { return Math.abs(val); }
          },
          title: { display: true, text: 'Number of ferrets' }
        },
        y: {
          stacked: false,
          title: { display: true, text: 'Age (weeks)' }
        }
      }
    }
  });
}

// ... rest of file (loadPyramidBinList and below) remains as before
