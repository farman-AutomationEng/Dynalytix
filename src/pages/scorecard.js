/**
 * scorecard.js — Scorecard Report
 *
 * Columns:
 * Group/Driver | Drivers/Vehicle | Score | % High Risk | Excessive Speeding |
 * Seat Belt | Possible Collision | Major Collision | Cell Phone Use | Distracted Driving
 *
 * Features:
 * - Group level table
 * - Sub-group table
 * - Driver/Vehicle table with search
 * - Export to CSV
 * - "All Groups Structure" toggle
 */

const ScoredcardPage = {

  SCORECARD_EVENTS: [
    'Excessive Speeding',
    'Seat Belt',
    'Possible Collision',
    'Major Collision',
    'Cell Phone Use',
    'Distracted Driving',
    'Tailgating',
    'Harsh Braking',
    'Hard Acceleration',
    'Speeding'
  ],

  async render(container, { api, fromDate, toDate, period, groupIds }) {

    const [events, ruleMap, drivers, devices, groups, trips] = await Promise.all([
      api.getExceptionEvents(fromDate, toDate, groupIds),
      api.getRuleMap(),
      api.getDrivers(groupIds),
      api.getDevices(groupIds),
      api.getGroups(),
      api.getTrips(fromDate, toDate, groupIds)
    ]);

    // ---- AGGREGATE PER DRIVER ----
    const driverEventMap = api.groupEventsByDriver(events);
    const tripAgg = api.aggregateTrips(trips);

    const driverRows = drivers.map(d => {
      const dEvts = driverEventMap[d.id] || [];
      const score = Utils.calculateScore(dEvts, ruleMap);
      const row = {
        id: d.id,
        name: ((d.firstName || '') + ' ' + (d.lastName || d.name || '')).trim(),
        vehicle: '-',
        score,
        highRiskPct: score > 4999 ? 100 : score > 999 ? 33 : 0
      };
      this.SCORECARD_EVENTS.forEach(evt => {
        row[evt] = dEvts.filter(e => (ruleMap[e.rule?.id] || '') === evt).length;
      });
      return row;
    });

    // ---- AGGREGATE PER GROUP ----
    const deviceEventMap = api.groupEventsByDevice(events);

    const groupRows = groups.map(g => {
      const gDevices = devices.filter(d => (d.groups || []).some(dg => dg.id === g.id));
      const gDrivers = drivers.filter(d => (d.groups || []).some(dg => dg.id === g.id));
      const gEvents = [];
      gDevices.forEach(dev => (deviceEventMap[dev.id] || []).forEach(e => gEvents.push(e)));

      const score = gEvents.length > 0 ? Utils.calculateScore(gEvents, ruleMap) : null;
      const row = {
        id: g.id,
        name: g.name,
        driverCount: gDrivers.length,
        score,
        highRiskPct: score > 4999 ? '33%' : score > 999 ? '10%' : '0%'
      };
      this.SCORECARD_EVENTS.forEach(evt => {
        row[evt] = gEvents.filter(e => (ruleMap[e.rule?.id] || '') === evt).length;
      });
      return row;
    });

    container.innerHTML = this.buildHTML({ groupRows, driverRows });
    this.setupSearch();
  },

  buildHTML({ groupRows, driverRows }) {
    const cols = this.SCORECARD_EVENTS;
    const colHeaders = cols.map(c => `<th>${c.toUpperCase()} ▼</th>`).join('');

    const groupTableRows = groupRows.map(row => `
      <tr>
        <td>${row.name}</td>
        <td>${row.driverCount}</td>
        <td>${Utils.scoreBadge(row.score)}</td>
        <td>${row.highRiskPct}</td>
        ${cols.map(c => {
          const v = row[c] || 0;
          return `<td>${v > 0 ? `<span class="count-badge alert">${v}</span>` : 0}</td>`;
        }).join('')}
      </tr>
    `).join('');

    const driverTableRows = driverRows.map(row => `
      <tr>
        <td class="link-text">${row.name}</td>
        <td>${Utils.scoreBadge(row.score)}</td>
        <td>${row.highRiskPct}%</td>
        ${cols.map(c => {
          const v = row[c] || 0;
          const isAlert = v > 5 && ['Possible Collision','Major Collision','Seat Belt','Cell Phone Use'].includes(c);
          return `<td>${v > 0 ? `<span class="count-badge ${isAlert ? 'alert' : ''}">${v}</span>` : 0}</td>`;
        }).join('')}
      </tr>
    `).join('');

    return `
    <div class="report-page">

      <div class="report-controls">
        <label class="toggle-label">
          <input type="checkbox" id="toggle-groups" checked />
          All Groups Structure
        </label>
        <button class="btn-export-csv" id="btn-csv">⬆ Export</button>
      </div>

      <!-- GROUP LEVEL TABLE -->
      <div class="card table-card">
        <div class="table-scroll">
          <table class="data-table" id="group-table">
            <thead>
              <tr>
                <th>GROUP ▼</th>
                <th>DRIVERS ▼</th>
                <th>SCORE ▼</th>
                <th>% HIGH RISK DRIVERS ▼</th>
                ${colHeaders}
              </tr>
            </thead>
            <tbody>${groupTableRows}</tbody>
          </table>
        </div>
      </div>

      <!-- DRIVER TABLE -->
      <div class="card table-card" style="margin-top:24px">
        <div class="card-header">
          <span class="card-title">${driverRows.length} Units</span>
          <input class="search-input" id="driver-search" placeholder="Search vehicle or driver..." />
        </div>
        <div class="table-scroll">
          <table class="data-table" id="driver-table">
            <thead>
              <tr>
                <th>CURRENT DRIVER ↕</th>
                <th>SCORE ▼</th>
                <th>% HIGH RISK ▼</th>
                ${colHeaders}
              </tr>
            </thead>
            <tbody id="driver-tbody">${driverTableRows}</tbody>
          </table>
        </div>
      </div>

    </div>
    `;
  },

  setupSearch() {
    const input = document.getElementById('driver-search');
    if (!input) return;
    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const tbody = document.getElementById('driver-tbody');
      if (!tbody) return;
      Array.from(tbody.querySelectorAll('tr')).forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
};

window.ScoredcardPage = ScoredcardPage;
