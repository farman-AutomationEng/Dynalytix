/**
 * scorecard.js — Scorecard Report
 *
 * GoAnalytics v3.9.7 backend logic implementation.
 *
 * HOW GoAnalytics ACTUALLY WORKS (reverse-engineered):
 *
 * 1. Rule IDs — GoAnalytics uses EXACT Geotab Rule IDs (e.g. "geotab.RuleSeatbeltId")
 *    to identify events. NOT rule name strings.
 *
 * 2. Score Bands (4 tiers):
 *    > 5000   → High     (Red)
 *    2000-5000 → Medium  (Orange)
 *    1000-2000 → Low     (Yellow)
 *    < 1000   → Very Low (Green)
 *
 * 3. Columns match GoAnalytics Scorecard exactly:
 *    Groups: GROUP | DRIVERS | SCORE | % HIGH RISK | [16 events] | GPS DISTANCE | IDLE
 *    Drivers: DRIVER | CURRENT VEHICLE | SCORE | [16 events] | GPS DISTANCE | IDLE
 *
 * 4. GPS Distance = trips.distance (meters → miles)
 *    Idle = trips.idlingDuration (seconds → HH:MM:SS)
 *
 * 5. % High Risk = (drivers with score > 5000) / total active drivers × 100
 */

const ScoredcardPage = {

  get EVENTS() { return Utils.RULE_CONFIG; },

  SEVERITY_COLORS: {
    high:   { bg: '#FED7D733', color: '#C53030' },
    medium: { bg: '#FBD38D33', color: '#C05621' },
    mild:   { bg: '#FEFCBF33', color: '#975A16' },
    low:    { bg: '#C6F6D533', color: '#276749' },
  },

  _sortCol: null,
  _sortDir: 1,

  async render(container, { api, fromDate, toDate, period, groupIds }) {

    const [events, ruleMap, drivers, devices, groups, trips] = await Promise.all([
      api.getExceptionEvents(fromDate, toDate, groupIds),
      api.getRuleMap(),
      api.getDrivers(groupIds),
      api.getDevices(groupIds),
      api.getGroups(),
      api.getTrips(fromDate, toDate, groupIds),
    ]);

    // Device → current driver (most recent trip)
    const sortedTrips = [...trips].sort(
      (a, b) => new Date(b.start || 0) - new Date(a.start || 0)
    );
    const deviceDriverMap = {};
    sortedTrips.forEach(t => {
      if (t.device?.id && t.driver?.id && !deviceDriverMap[t.device.id]) {
        deviceDriverMap[t.device.id] = t.driver.id;
      }
    });

    const driverEventMap = api.groupEventsByDriver(events);
    const deviceEventMap = api.groupEventsByDevice(events);

    // ---- Driver rows ----
    const driverRows = drivers.map(d => {
      const dEvts   = driverEventMap[d.id] || [];
      const score   = dEvts.length > 0 ? Utils.calculateScore(dEvts, ruleMap) : null;
      const eventCounts = Utils.countEventsByKey(dEvts, ruleMap);

      const dTrips   = trips.filter(t => t.driver?.id === d.id);
      const gpsMiles = dTrips.reduce((s, t) => s + Utils.metersToMiles(t.distance || 0), 0);
      const idleSec  = dTrips.reduce((s, t) => s + (t.idlingDuration || 0), 0);
      const vehicle  = devices.find(dev => deviceDriverMap[dev.id] === d.id);
      const name     = ((d.firstName || '') + ' ' + (d.lastName || d.name || '')).trim();

      return { id: d.id, name: name || '-', vehicleName: vehicle?.name || '-', score, eventCounts, gpsMiles, idleSec };
    }).filter(d => d.name && d.name !== '-');

    // ---- Group row builder ----
    const buildGroupRow = (g) => {
      const gDevices = devices.filter(d => (d.groups || []).some(dg => dg.id === g.id));
      const gDrivers = drivers.filter(d => (d.groups || []).some(dg => dg.id === g.id));
      const gEvts = [];
      gDevices.forEach(dev => (deviceEventMap[dev.id] || []).forEach(e => gEvts.push(e)));
      gDrivers.forEach(drv => (driverEventMap[drv.id] || []).forEach(e => gEvts.push(e)));

      const score       = gEvts.length > 0 ? Utils.calculateScore(gEvts, ruleMap) : null;
      const eventCounts = Utils.countEventsByKey(gEvts, ruleMap);
      const gTrips      = trips.filter(t => gDrivers.some(d => d.id === t.driver?.id));
      const gpsMiles    = gTrips.reduce((s, t) => s + Utils.metersToMiles(t.distance || 0), 0);
      const idleSec     = gTrips.reduce((s, t) => s + (t.idlingDuration || 0), 0);
      const gDriverRows = driverRows.filter(dr => gDrivers.some(d => d.id === dr.id));
      const activeCount = gDriverRows.filter(d => d.score !== null).length;
      const highCount   = gDriverRows.filter(d => d.score !== null && d.score > 5000).length;
      const highRiskPct = activeCount > 0 ? Math.round((highCount / activeCount) * 100) : 0;

      return { name: g.name, driverCount: gDrivers.length, score, highRiskPct, eventCounts, gpsMiles, idleSec };
    };

    const groupIdSet  = new Set(groups.map(g => g.id));
    const topGroups   = groups.filter(g => !g.parent || !groupIdSet.has(g.parent?.id));
    const subGroups   = groups.filter(g => topGroups.some(tg => tg.id === g.parent?.id));

    let groupRows;
    if (topGroups.length > 0) {
      groupRows = topGroups.map(buildGroupRow);
    } else {
      const activeCount = driverRows.filter(d => d.score !== null).length;
      const highCount   = driverRows.filter(d => d.score !== null && d.score > 5000).length;
      groupRows = [{
        name: 'Dynasty Communications',
        driverCount: driverRows.length,
        score: events.length > 0 ? Utils.calculateScore(events, ruleMap) : null,
        highRiskPct: activeCount > 0 ? Math.round((highCount / activeCount) * 100) : 0,
        eventCounts: Utils.countEventsByKey(events, ruleMap),
        gpsMiles: trips.reduce((s, t) => s + Utils.metersToMiles(t.distance || 0), 0),
        idleSec:  trips.reduce((s, t) => s + (t.idlingDuration || 0), 0),
      }];
    }

    const subGroupRows = subGroups.map(buildGroupRow);

    container.innerHTML = this.buildHTML({ groupRows, subGroupRows, driverRows });
    this.setupSearch();
    this.setupSort();
    this.setupGroupToggle();
    this.setupExport(driverRows);
  },

  buildHTML({ groupRows, subGroupRows, driverRows }) {
    const evts      = this.EVENTS;
    const evtHeaders = evts.map(et =>
      `<th class="sc-col-evt" title="${et.label} | Severity: ${et.severity} | Weight: ${et.weight}">${et.label.toUpperCase()} ▼</th>`
    ).join('');

    const buildGroupTr = (row) => {
      const hrColor  = this._highRiskColor(row.highRiskPct);
      const evtCells = evts.map(et => {
        const v  = row.eventCounts[et.key] || 0;
        if (v === 0) return '<td class="sc-zero">0</td>';
        const sc = this.SEVERITY_COLORS[et.severity];
        return `<td><span class="count-badge" style="background:${sc.bg};color:${sc.color}">${v}</span></td>`;
      }).join('');
      return `
        <tr>
          <td class="sc-name">${row.name}</td>
          <td class="sc-num">${row.driverCount}</td>
          <td>${this._scoreBadge(row.score)}</td>
          <td><span style="font-weight:600;color:${hrColor}">${row.highRiskPct}%</span></td>
          ${evtCells}
          <td><span class="colored-badge blue">${Utils.formatNumber(row.gpsMiles)} mi</span></td>
          <td><span class="colored-badge teal">${Utils.secondsToHMS(row.idleSec)}</span></td>
        </tr>`;
    };

    const driverTableRows = driverRows.map(row => {
      const evtCells = evts.map(et => {
        const v  = row.eventCounts[et.key] || 0;
        if (v === 0) return '<td class="sc-zero">0</td>';
        const sc         = this.SEVERITY_COLORS[et.severity];
        const isRedAlert = v >= 5 && et.severity === 'high';
        const bg         = isRedAlert ? '#FED7D755' : sc.bg;
        return `<td><span class="count-badge" style="background:${bg};color:${sc.color};font-weight:${isRedAlert ? 700 : 600}">${v}</span></td>`;
      }).join('');
      return `
        <tr>
          <td class="link-text sc-col-sticky">${row.name}</td>
          <td class="link-text">${row.vehicleName}</td>
          <td>${this._scoreBadge(row.score)}</td>
          ${evtCells}
          <td><span class="colored-badge blue">${Utils.formatNumber(row.gpsMiles)} mi</span></td>
          <td><span class="colored-badge teal">${Utils.secondsToHMS(row.idleSec)}</span></td>
        </tr>`;
    }).join('');

    const subGroupRows_html = subGroupRows.length > 0
      ? subGroupRows.map(r => buildGroupTr(r)).join('')
      : `<tr><td colspan="99" class="sc-empty">No sub-groups available</td></tr>`;

    return `
    <div class="report-page">

      <div class="report-controls">
        <label class="toggle-label">
          <input type="checkbox" id="toggle-groups" checked />
          All Groups Structure
        </label>
        <button class="btn-export-csv" id="btn-csv">⬆ Export CSV</button>
      </div>

      <div class="sc-legend">
        <span class="sc-legend-title">Score Bands:</span>
        <span class="sc-legend-item" style="background:#FED7D7;color:#C53030">High (&gt;5,000)</span>
        <span class="sc-legend-item" style="background:#FBD38D;color:#C05621">Medium (2,000–5,000)</span>
        <span class="sc-legend-item" style="background:#FEFCBF;color:#975A16">Low (1,000–2,000)</span>
        <span class="sc-legend-item" style="background:#C6F6D5;color:#276749">Very Low (&lt;1,000)</span>
        <span class="sc-legend-sep"> | </span>
        <span class="sc-legend-title">Event Severity:</span>
        <span class="sc-legend-item" style="background:#FED7D733;color:#C53030">High</span>
        <span class="sc-legend-item" style="background:#FBD38D33;color:#C05621">Medium</span>
        <span class="sc-legend-item" style="background:#FEFCBF33;color:#975A16">Mild</span>
        <span class="sc-legend-item" style="background:#C6F6D533;color:#276749">Low</span>
      </div>

      <div class="card table-card">
        <div class="card-header">
          <span class="card-title">Fleet Summary</span>
          <span class="card-subtitle">Top-level group</span>
        </div>
        <div class="table-scroll">
          <table class="data-table sc-table" id="group1-table">
            <thead>
              <tr>
                <th>GROUP ▼</th><th>DRIVERS ▼</th><th>SCORE ▼</th><th>% HIGH RISK DRIVERS ▼</th>
                ${evtHeaders}
                <th>GPS DISTANCE ▼</th><th>IDLE ▼</th>
              </tr>
            </thead>
            <tbody>${groupRows.map(r => buildGroupTr(r)).join('')}</tbody>
          </table>
        </div>
      </div>

      <div class="card table-card" id="sub-groups-section">
        <div class="card-header">
          <span class="card-title">Sub-Groups</span>
          <span class="card-subtitle">All groups structure</span>
        </div>
        <div class="table-scroll">
          <table class="data-table sc-table" id="group2-table">
            <thead>
              <tr>
                <th>GROUP ▼</th><th>DRIVERS ▼</th><th>SCORE ▼</th><th>% HIGH RISK DRIVERS ▼</th>
                ${evtHeaders}
                <th>GPS DISTANCE ▼</th><th>IDLE ▼</th>
              </tr>
            </thead>
            <tbody>${subGroupRows_html}</tbody>
          </table>
        </div>
      </div>

      <div class="card table-card">
        <div class="card-header">
          <span class="card-title">${driverRows.length} Units</span>
          <input class="search-input" id="sc-driver-search" placeholder="Search vehicle or driver..." />
        </div>
        <div class="table-scroll">
          <table class="data-table sc-table dense-table" id="driver-table">
            <thead>
              <tr>
                <th class="sc-col-sticky">CURRENT DRIVER ↕</th>
                <th>CURRENT VEHICLE ↕</th>
                <th>SCORE ▼</th>
                ${evtHeaders}
                <th>GPS DISTANCE ▼</th><th>IDLE ▼</th>
              </tr>
            </thead>
            <tbody id="driver-tbody">${driverTableRows}</tbody>
          </table>
        </div>
      </div>

    </div>`;
  },

  _scoreBadge(score) {
    if (score === null || score === undefined) return '<span class="score-badge neutral">-</span>';
    const tier = Utils.getScoreTier(score);
    if (!tier) return '<span class="score-badge neutral">-</span>';
    return `<span class="score-badge" style="background:${tier.bg};color:${tier.color};border:1px solid ${tier.color}">${Utils.formatNumber(score)}</span>`;
  },

  _highRiskColor(pct) {
    if (pct > 15) return '#C53030';
    if (pct > 8)  return '#C05621';
    if (pct > 3)  return '#975A16';
    return '#276749';
  },

  setupSearch() {
    const input = document.getElementById('sc-driver-search');
    if (!input) return;
    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('#driver-tbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  },

  setupSort() {
    const table = document.getElementById('driver-table');
    if (!table) return;
    table.querySelectorAll('thead th').forEach((th, colIndex) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const tbody = document.getElementById('driver-tbody');
        if (!tbody) return;
        this._sortDir = this._sortCol === colIndex ? this._sortDir * -1 : 1;
        this._sortCol = colIndex;
        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.sort((a, b) => {
          const aText = a.cells[colIndex]?.textContent?.trim() || '';
          const bText = b.cells[colIndex]?.textContent?.trim() || '';
          const aNum  = parseFloat(aText.replace(/[^0-9.-]/g, ''));
          const bNum  = parseFloat(bText.replace(/[^0-9.-]/g, ''));
          if (!isNaN(aNum) && !isNaN(bNum)) return (aNum - bNum) * this._sortDir;
          return aText.localeCompare(bText) * this._sortDir;
        });
        rows.forEach(r => tbody.appendChild(r));
        table.querySelectorAll('thead th').forEach((h, i) => {
          h.textContent = h.textContent.replace(/[ ↑↓▼]+$/, '').trim() +
            (i === colIndex ? (this._sortDir === 1 ? ' ↓' : ' ↑') : ' ▼');
        });
      });
    });
  },

  setupGroupToggle() {
    const toggle  = document.getElementById('toggle-groups');
    const section = document.getElementById('sub-groups-section');
    if (!toggle || !section) return;
    const update = () => { section.style.display = toggle.checked ? '' : 'none'; };
    update();
    toggle.addEventListener('change', update);
  },

  setupExport(driverRows) {
    const btn = document.getElementById('btn-csv');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const evts    = this.EVENTS;
      const headers = ['Driver', 'Current Vehicle', 'Score',
        ...evts.map(e => e.label), 'GPS Distance (mi)', 'Idle (HH:MM:SS)'];
      const rows = driverRows.map(r => [
        r.name, r.vehicleName, r.score !== null ? r.score : '-',
        ...evts.map(e => r.eventCounts[e.key] || 0),
        r.gpsMiles, Utils.secondsToHMS(r.idleSec),
      ]);
      const csv  = [headers, ...rows]
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'scorecard-' + new Date().toISOString().split('T')[0] + '.csv';
      a.click(); URL.revokeObjectURL(url);
    });
  },
};

window.ScoredcardPage = ScoredcardPage;
