/**
 * scored-events.js — Scored Events Dashboard
 *
 * Features:
 *  - ALL rules from Geotab (not just 6 predefined) — dynamically fetched
 *  - Camera AI rules separated from telematics rules
 *  - Sortable on ANY column — A-Z or Z-A — without leaving the page
 *  - KPI summary tiles for each rule (count + trend)
 *  - Full driver/vehicle table with every rule as a column
 *  - Idling time (HH:MM:SS) from Trip entity
 *  - Column search/filter
 */

const ScoredEventsPage = {

  // Sort state — maintained between column clicks
  _sortCol: null,
  _sortDir: 1,

  // Rule filter state
  _activeFilter: 'all', // 'all' | 'telematics' | 'camera'

  // ============================================================
  // RENDER
  // ============================================================
  async render(container, { api, fromDate, toDate, period, groupIds, vehicleMode }) {

    // ---- FETCH DATA IN PARALLEL ----
    const periodMs = toDate - fromDate;
    const prevTo   = new Date(fromDate);
    const prevFrom = new Date(fromDate.getTime() - periodMs);

    const [events, prevEvents, allRules, drivers, devices, trips] = await Promise.all([
      api.getExceptionEvents(fromDate, toDate, groupIds),
      api.getExceptionEvents(prevFrom, prevTo, groupIds),
      api.getAllRulesEnriched(),        // All rules — not just predefined 6
      api.getDrivers(groupIds),
      api.getDevices(groupIds),
      api.getTrips(fromDate, toDate, groupIds),
    ]);

    // ---- FILTER RULES — only rules that have events in this period ----
    // Build a quick set of rule IDs that appear in current events
    const activeRuleIds = new Set(events.map(e => e.rule?.id).filter(Boolean));

    // Include all rules that have events, plus show zero-count rules if < 50 total rules
    const rulesWithEvents  = allRules.filter(r => activeRuleIds.has(r.id));
    const rulesWithoutEvents = allRules.length <= 50
      ? allRules.filter(r => !activeRuleIds.has(r.id))
      : [];

    // Final ordered rule list: active first, then inactive
    const orderedRules = [...rulesWithEvents, ...rulesWithoutEvents];

    // Build a ruleId → rule object map for quick lookup
    const ruleById = {};
    orderedRules.forEach(r => { ruleById[r.id] = r; });

    // ---- AGGREGATE EVENT COUNTS PER RULE ----
    const currentCounts = {}; // { ruleId: count }
    const prevCounts    = {};

    events.forEach(e => {
      if (e.rule?.id) currentCounts[e.rule.id] = (currentCounts[e.rule.id] || 0) + 1;
    });
    prevEvents.forEach(e => {
      if (e.rule?.id) prevCounts[e.rule.id] = (prevCounts[e.rule.id] || 0) + 1;
    });

    // ---- IDLING FROM TRIPS ----
    const totalIdleSec = trips.reduce((s, t) => s + (t.idlingDuration || 0), 0);

    // ---- ENTITY ROWS (driver or vehicle mode) ----
    const entities = vehicleMode ? devices : drivers;
    const eventsByEntity = vehicleMode
      ? api.groupEventsByDevice(events)
      : api.groupEventsByDriver(events);

    const entityRows = entities.map(entity => {
      const entityEvents = eventsByEntity[entity.id] || [];

      // Count per rule for this entity
      const ruleCounts = {};
      entityEvents.forEach(e => {
        if (e.rule?.id) ruleCounts[e.rule.id] = (ruleCounts[e.rule.id] || 0) + 1;
      });

      // Idling for this entity
      const entityTrips = trips.filter(t =>
        vehicleMode ? t.device?.id === entity.id : t.driver?.id === entity.id
      );
      const idleSec = entityTrips.reduce((s, t) => s + (t.idlingDuration || 0), 0);
      const miles   = entityTrips.reduce((s, t) => s + Utils.metersToMiles(t.distance || 0), 0);

      const name = vehicleMode
        ? (entity.name || '—')
        : ((entity.firstName || '') + ' ' + (entity.lastName || entity.name || '')).trim();

      return {
        id:         entity.id,
        name:       name || '—',
        ruleCounts,
        idleSec,
        miles,
        hasActivity: Object.keys(ruleCounts).length > 0 || idleSec > 0,
      };
    }).filter(r => r.hasActivity);

    // Sort entity rows by total event count descending by default
    entityRows.sort((a, b) => {
      const aTotal = Object.values(a.ruleCounts).reduce((s,v) => s+v, 0);
      const bTotal = Object.values(b.ruleCounts).reduce((s,v) => s+v, 0);
      return bTotal - aTotal;
    });

    // ---- RENDER ----
    container.innerHTML = this._buildHTML({
      orderedRules,
      currentCounts,
      prevCounts,
      totalIdleSec,
      entityRows,
      vehicleMode,
    });

    this._setupSort(orderedRules, entityRows);
    this._setupSearch();
    this._setupFilterTabs(orderedRules, currentCounts, prevCounts, entityRows, vehicleMode);
    this._setupExport(orderedRules, entityRows, vehicleMode);
  },

  // ============================================================
  // HTML BUILDER
  // ============================================================
  _buildHTML({ orderedRules, currentCounts, prevCounts, totalIdleSec, entityRows, vehicleMode }) {

    // ---- KPI TILES ----
    // Show all rules that have > 0 events as tiles, plus idling tile
    const activeTiles = orderedRules
      .filter(r => (currentCounts[r.id] || 0) > 0 || (prevCounts[r.id] || 0) > 0);

    const tiles = activeTiles.map(r => {
      const count = currentCounts[r.id] || 0;
      const prev  = prevCounts[r.id]    || 0;
      const trend = Utils.calcTrend(count, prev);
      const isHighAlert = count > 0 && r.isCamera;
      const bgAlert     = isHighAlert ? 'kpi-event-card alert' : 'kpi-event-card';
      return `
        <div class="card ${bgAlert}">
          <div class="kpi-event-label">${r.isCamera ? '📷 ' : ''}${r.name}</div>
          <div class="kpi-event-count">${count}</div>
          ${count > 0 || prev > 0
            ? `<div class="kpi-event-trend">${Utils.trendBadge(trend)}</div>`
            : ''}
        </div>`;
    }).join('');

    const idleTile = `
      <div class="card kpi-event-card">
        <div class="kpi-event-label">⏱ Idle Time (HH:MM:SS)</div>
        <div class="kpi-event-count small">${Utils.secondsToHMS(totalIdleSec)}</div>
      </div>`;

    // ---- SUMMARY LINE ----
    const totalEvents    = Object.values(currentCounts).reduce((s, v) => s + v, 0);
    const telematicsCount = orderedRules.filter(r => !r.isCamera && (currentCounts[r.id] || 0) > 0).length;
    const cameraCount     = orderedRules.filter(r =>  r.isCamera && (currentCounts[r.id] || 0) > 0).length;

    // ---- TABLE COLUMNS = all rules (only those with events, to keep table manageable) ----
    const tableRules = orderedRules.filter(r => (currentCounts[r.id] || 0) > 0);

    const colHeaders = tableRules.map((r, i) =>
      `<th class="se-col-rule" data-col="${i + 2}" title="${r.name}">
        ${r.isCamera ? '📷 ' : ''}${r.name.toUpperCase()} ↕
      </th>`
    ).join('');

    const tableRows = entityRows.map(row => {
      const ruleCells = tableRules.map(r => {
        const v = row.ruleCounts[r.id] || 0;
        if (v === 0) return `<td class="se-zero">0</td>`;
        const isHighAlert = v >= 5 && r.isCamera;
        const bg    = isHighAlert ? '#FED7D755' : '#FF980022';
        const color = isHighAlert ? '#C53030'   : '#C05621';
        return `<td><span class="count-badge" style="background:${bg};color:${color}">${v}</span></td>`;
      }).join('');

      return `<tr>
        <td class="link-text se-sticky-col">${row.name}</td>
        <td>${Utils.secondsToHMS(row.idleSec)}</td>
        ${ruleCells}
      </tr>`;
    }).join('');

    return `
      <div class="scored-events-page">

        <!-- SUMMARY BAR -->
        <div class="se-summary-bar">
          <span class="se-summary-item">
            <strong>${totalEvents.toLocaleString()}</strong> total events
          </span>
          <span class="se-summary-item">
            <strong>${tableRules.length}</strong> active rules
          </span>
          <span class="se-summary-item">
            <strong>${telematicsCount}</strong> telematics rules
          </span>
          <span class="se-summary-item" style="color:var(--primary)">
            <strong>📷 ${cameraCount}</strong> camera AI rules
          </span>
        </div>

        <!-- FILTER TABS -->
        <div class="se-filter-tabs">
          <button class="se-filter-btn se-filter-active" data-filter="all">
            All Rules (${orderedRules.filter(r => (currentCounts[r.id]||0)>0).length})
          </button>
          <button class="se-filter-btn" data-filter="telematics">
            📍 Telematics (${telematicsCount})
          </button>
          <button class="se-filter-btn" data-filter="camera">
            📷 Camera AI (${cameraCount})
          </button>
        </div>

        <!-- KPI TILES GRID -->
        <div class="kpi-events-grid" id="se-tiles-grid">
          ${tiles}
          ${idleTile}
        </div>

        <!-- ENTITY TABLE -->
        <div class="card table-card">
          <div class="card-header">
            <span class="card-title">
              ${entityRows.length} ${vehicleMode ? 'Vehicles' : 'Drivers'}
            </span>
            <span class="card-subtitle">
              Click any column header to sort A-Z or Z-A
            </span>
            <input class="search-input" id="se-search"
              placeholder="Search ${vehicleMode ? 'vehicle' : 'driver'}..." />
            <button class="btn-export-csv" id="btn-se-csv">⬆ Export</button>
          </div>
          <div class="table-scroll">
            <table class="data-table dense-table se-main-table" id="se-table">
              <thead>
                <tr>
                  <th class="se-sticky-col" data-col="0">
                    ${vehicleMode ? 'VEHICLE' : 'DRIVER'} ↕
                  </th>
                  <th data-col="1">IDLE TIME ↕</th>
                  ${colHeaders}
                </tr>
              </thead>
              <tbody id="se-tbody">${tableRows}</tbody>
            </table>
          </div>
        </div>

      </div>`;
  },

  // ============================================================
  // SORT — any column, A-Z / Z-A, stays on current page
  // ============================================================
  _setupSort(orderedRules, entityRows) {
    const table = document.getElementById('se-table');
    if (!table) return;

    table.querySelectorAll('thead th').forEach((th, colIndex) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        this._sortDir = this._sortCol === colIndex ? this._sortDir * -1 : 1;
        this._sortCol = colIndex;

        const tbody = document.getElementById('se-tbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.sort((a, b) => {
          const aText = (a.cells[colIndex]?.textContent || '').trim();
          const bText = (b.cells[colIndex]?.textContent || '').trim();
          const aNum  = parseFloat(aText.replace(/[^0-9.:]/g, ''));
          const bNum  = parseFloat(bText.replace(/[^0-9.:]/g, ''));
          if (!isNaN(aNum) && !isNaN(bNum)) return (aNum - bNum) * this._sortDir;
          return aText.localeCompare(bText) * this._sortDir;
        });
        rows.forEach(r => tbody.appendChild(r));

        // Update header indicators
        table.querySelectorAll('thead th').forEach((h, i) => {
          h.textContent = h.textContent.replace(/[ ↑↓↕]+$/, '').trim();
          h.textContent += i === colIndex
            ? (this._sortDir === 1 ? ' ↑' : ' ↓') : ' ↕';
        });
      });
    });
  },

  // ============================================================
  // SEARCH
  // ============================================================
  _setupSearch() {
    const input = document.getElementById('se-search');
    if (!input) return;
    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('#se-tbody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  },

  // ============================================================
  // FILTER TABS — All / Telematics / Camera AI
  // Filters the KPI tiles without reloading data
  // ============================================================
  _setupFilterTabs(orderedRules, currentCounts, prevCounts, entityRows, vehicleMode) {
    document.querySelectorAll('.se-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter');
        this._activeFilter = filter;

        // Update active tab
        document.querySelectorAll('.se-filter-btn').forEach(b =>
          b.classList.toggle('se-filter-active', b === btn)
        );

        // Filter tiles
        const tilesGrid = document.getElementById('se-tiles-grid');
        if (tilesGrid) {
          tilesGrid.querySelectorAll('.kpi-event-card').forEach(tile => {
            const label = tile.querySelector('.kpi-event-label')?.textContent || '';
            const isCam = label.includes('📷');
            if (filter === 'all') {
              tile.style.display = '';
            } else if (filter === 'camera') {
              tile.style.display = isCam ? '' : 'none';
            } else {
              tile.style.display = !isCam ? '' : 'none';
            }
          });
        }

        // Filter table columns
        const table = document.getElementById('se-table');
        if (table) {
          table.querySelectorAll('thead th.se-col-rule').forEach((th, i) => {
            const isCamera = th.textContent.includes('📷');
            const visible  = filter === 'all'
              || (filter === 'camera' && isCamera)
              || (filter === 'telematics' && !isCamera);

            // Hide/show col index (i + 2 because first 2 cols are Name + Idle)
            const colIdx = i + 2;
            th.style.display = visible ? '' : 'none';
            document.querySelectorAll(`#se-tbody tr`).forEach(row => {
              if (row.cells[colIdx]) {
                row.cells[colIdx].style.display = visible ? '' : 'none';
              }
            });
          });
        }
      });
    });
  },

  // ============================================================
  // EXPORT
  // ============================================================
  _setupExport(orderedRules, entityRows, vehicleMode) {
    const btn = document.getElementById('btn-se-csv');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const tableRules = orderedRules.filter(r => true); // all rules
      const headers = [
        vehicleMode ? 'Vehicle' : 'Driver',
        'Idle Time (HH:MM:SS)',
        ...tableRules.map(r => r.name),
      ];
      const rows = entityRows.map(row => [
        row.name,
        Utils.secondsToHMS(row.idleSec),
        ...tableRules.map(r => row.ruleCounts[r.id] || 0),
      ]);
      const csv = [headers, ...rows]
        .map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))
        .join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'scored-events-' + new Date().toISOString().split('T')[0] + '.csv';
      a.click();
    });
  },
};

window.ScoredEventsPage = ScoredEventsPage;
