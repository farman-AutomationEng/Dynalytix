/**
 * compliance-utilization.js — Compliance & Utilization
 *
 * Sections:
 *  1. ASSET STATUS TABLE — Combined GPS + Camera health per vehicle
 *     Columns: Asset Name | GPS Status | Last GPS Seen | Camera | Camera Status |
 *              Camera Health | Last Camera Seen | Current Driver
 *
 *  2. GROUP SUMMARY TABLE — Aggregate metrics per group
 *
 *  3. DRIVER UTILIZATION TABLE — Per-driver trip metrics
 *     Columns: Driver | GPS | Camera | Odometer | Days Driven |
 *              Miles | Hours | Idling | Utilization %
 */

const CompliancePage = {

  // ---- SORT STATE ----
  _assetSortCol: 0,
  _assetSortDir: 1,
  _driverSortCol: 0,
  _driverSortDir: 1,

  // ============================================================
  // RENDER
  // ============================================================
  async render(container, { api, fromDate, toDate, period, groupIds }) {

    // Fetch all data in parallel
    const [devices, groups, drivers, trips, deviceStatusList] = await Promise.all([
      api.getDevices(groupIds),
      api.getGroups(),
      api.getDrivers(groupIds),
      api.getTrips(fromDate, toDate, groupIds),
      api.getDeviceStatusInfo(groupIds),
    ]);

    // Camera health — non-blocking (fails gracefully)
    let cameraHealthData = [];
    try {
      cameraHealthData = await api.getCameraHealthData(fromDate, toDate, groupIds);
    } catch (e) {
      console.warn('[Compliance] Camera health data unavailable:', e.message);
    }

    // ---- BUILD LOOKUP MAPS ----
    const cameraDevices   = api.getCameraDevices(devices);
    const cameraDeviceIds = new Set(cameraDevices.map(d => d.id));
    const gpsStatusMap    = api.buildGpsStatusMap(deviceStatusList);
    const camStatusMap    = api.buildCameraStatusMap(deviceStatusList, cameraDevices);
    const camHealthMap    = api.buildCameraHealthMap(cameraHealthData);

    // Most recent driver per device (from trips)
    const deviceDriverMap = {};
    [...trips]
      .sort((a, b) => new Date(b.start || 0) - new Date(a.start || 0))
      .forEach(t => {
        if (t.device?.id && t.driver?.id && !deviceDriverMap[t.device.id]) {
          deviceDriverMap[t.device.id] = t.driver.id;
        }
      });

    const driverById = {};
    drivers.forEach(d => { driverById[d.id] = d; });

    // ---- ASSET STATUS ROWS (one per device) ----
    const assetRows = devices.map(dev => {
      const gps       = gpsStatusMap[dev.id]  || {};
      const hasCam    = cameraDeviceIds.has(dev.id);
      const cam       = hasCam ? (camStatusMap[dev.id] || {}) : null;
      const health    = hasCam ? (camHealthMap[dev.id]  || {}) : null;
      const driverId  = deviceDriverMap[dev.id];
      const driver    = driverId ? driverById[driverId] : null;
      const driverName = driver
        ? ((driver.firstName || '') + ' ' + (driver.lastName || driver.name || '')).trim()
        : '—';

      return {
        id:             dev.id,
        name:           dev.name || '—',
        gpsOnline:      gps.isOnline    || false,
        gpsLastSeen:    gps.lastSeen    || null,
        gpsDaysOffline: gps.daysOffline ?? null,
        hasCam,
        camOnline:      cam ? (cam.isOnline || false)    : null,
        camLastSeen:    cam ? (cam.lastSeen || null)     : null,
        camDaysOffline: cam ? (cam.daysOffline ?? null)  : null,
        sdHealth:       health ? (health.sdHealth || 'Unknown') : null,
        driverName,
      };
    });

    // ---- PERIOD DAYS (for utilization %) ----
    const totalPeriodDays = Math.max(
      1,
      Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24))
    );

    // ---- DRIVER UTILIZATION ROWS ----
    const driverRows = drivers.map(d => {
      const dTrips   = trips.filter(t => t.driver?.id === d.id);
      const miles    = dTrips.reduce((s, t) => s + Utils.metersToMiles(t.distance || 0), 0);
      const drivSec  = dTrips.reduce((s, t) => s + (t.drivingDuration || 0), 0);
      const idleSec  = dTrips.reduce((s, t) => s + (t.idlingDuration  || 0), 0);
      const daysDriven = new Set(dTrips.map(t => (t.start || '').split('T')[0])).size;
      const utilPct  = Math.round((daysDriven / totalPeriodDays) * 100);

      const devId   = dTrips[0]?.device?.id;
      const vehicle = devId ? devices.find(dev => dev.id === devId) : null;
      const hasCam  = vehicle ? cameraDeviceIds.has(vehicle.id) : false;
      const gps     = vehicle ? gpsStatusMap[vehicle.id] : null;
      const odometer = vehicle
        ? Math.round((vehicle.odometer || 0) * 0.000621371)
        : 0;

      return {
        name:        ((d.firstName || '') + ' ' + (d.lastName || d.name || '')).trim(),
        vehicleName: vehicle?.name || '—',
        hasGPS:      !!vehicle,
        hasCam,
        gpsOnline:   gps ? gps.isOnline : null,
        odometer,
        daysDriven,
        miles,
        drivSec,
        idleSec,
        utilPct,
      };
    }).filter(r => r.name && r.name.trim() !== '');

    // ---- GROUP SUMMARY ROWS ----
    const groupRows = groups.map(g => {
      const gDevices  = devices.filter(d => (d.groups || []).some(dg => dg.id === g.id));
      const gCameras  = gDevices.filter(d => cameraDeviceIds.has(d.id));
      const gDriverIds = drivers
        .filter(d => (d.groups || []).some(dg => dg.id === g.id))
        .map(d => d.id);

      const gpsOffline = gDevices.filter(dev => {
        const s = gpsStatusMap[dev.id];
        return s && !s.isOnline && (s.daysOffline || 0) >= 5;
      }).length;

      const camOffline = gCameras.filter(dev => {
        const s = camStatusMap[dev.id];
        return s && !s.isOnline && (s.daysOffline || 0) >= 5;
      }).length;

      const gTrips  = trips.filter(t => gDriverIds.includes(t.driver?.id));
      const miles   = gTrips.reduce((s, t) => s + Utils.metersToMiles(t.distance || 0), 0);
      const drivSec = gTrips.reduce((s, t) => s + (t.drivingDuration || 0), 0);
      const idleSec = gTrips.reduce((s, t) => s + (t.idlingDuration  || 0), 0);
      const daysDriven = new Set(gTrips.map(t => (t.start || '').split('T')[0])).size;
      const utilPct = Math.round((daysDriven / totalPeriodDays) * 100);

      return {
        name:     g.name,
        vehicles: gDevices.length,
        cameras:  gCameras.length,
        gpsOffline,
        camOffline,
        daysDriven,
        miles,
        drivSec,
        idleSec,
        utilPct,
      };
    });

    // ---- RENDER ----
    container.innerHTML = this._buildHTML({ assetRows, groupRows, driverRows });

    // Wire up interactivity after DOM is ready
    this._setupAssetSort(assetRows);
    this._setupDriverSort(driverRows);
    this._setupSearch('comp-asset-search',  'comp-asset-tbody');
    this._setupSearch('comp-driver-search', 'comp-driver-tbody');
    this._setupExport(assetRows, driverRows);
  },

  // ============================================================
  // HTML
  // ============================================================
  _buildHTML({ assetRows, groupRows, driverRows }) {

    const utilBar = (pct) => {
      const color = pct >= 70 ? '#673AB7' : pct >= 40 ? '#2196F3' : '#90CAF9';
      return `<div class="util-bar-wrap">
        <div class="util-bar" style="width:${pct}%;background:${color}"></div>
        <span>${pct}%</span>
      </div>`;
    };

    // KPI summary cards
    const totalAssets     = assetRows.length;
    const gpsOnline       = assetRows.filter(r => r.gpsOnline).length;
    const gpsOffline5     = assetRows.filter(r => !r.gpsOnline && (r.gpsDaysOffline ?? 0) >= 5).length;
    const totalCams       = assetRows.filter(r => r.hasCam).length;
    const camOnline       = assetRows.filter(r => r.hasCam && r.camOnline).length;
    const camOffline5     = assetRows.filter(r => r.hasCam && !r.camOnline && (r.camDaysOffline ?? 0) >= 5).length;
    const camHealthWarn   = assetRows.filter(r => r.hasCam && ['Warning','Critical'].includes(r.sdHealth)).length;

    const kpiCards = `
      <div class="comp-kpi-row">
        <div class="card comp-kpi-card">
          <div class="comp-kpi-icon">🚗</div>
          <div class="comp-kpi-value">${totalAssets}</div>
          <div class="comp-kpi-label">Total Assets</div>
        </div>
        <div class="card comp-kpi-card">
          <div class="comp-kpi-icon" style="color:var(--green)">📡</div>
          <div class="comp-kpi-value" style="color:var(--green)">${gpsOnline}</div>
          <div class="comp-kpi-label">GPS Online</div>
        </div>
        <div class="card comp-kpi-card ${gpsOffline5 > 0 ? 'comp-kpi-alert' : ''}">
          <div class="comp-kpi-icon" style="color:var(--red)">📡</div>
          <div class="comp-kpi-value" style="color:${gpsOffline5 > 0 ? 'var(--red)' : 'inherit'}">${gpsOffline5}</div>
          <div class="comp-kpi-label">GPS Offline 5+ Days</div>
        </div>
        <div class="card comp-kpi-card">
          <div class="comp-kpi-icon" style="color:var(--green)">📷</div>
          <div class="comp-kpi-value" style="color:var(--green)">${camOnline}/${totalCams}</div>
          <div class="comp-kpi-label">Cameras Online</div>
        </div>
        <div class="card comp-kpi-card ${camOffline5 > 0 ? 'comp-kpi-alert' : ''}">
          <div class="comp-kpi-icon" style="color:var(--red)">📷</div>
          <div class="comp-kpi-value" style="color:${camOffline5 > 0 ? 'var(--red)' : 'inherit'}">${camOffline5}</div>
          <div class="comp-kpi-label">Cameras Offline 5+ Days</div>
        </div>
        <div class="card comp-kpi-card ${camHealthWarn > 0 ? 'comp-kpi-alert' : ''}">
          <div class="comp-kpi-icon">💾</div>
          <div class="comp-kpi-value" style="color:${camHealthWarn > 0 ? 'var(--orange)' : 'inherit'}">${camHealthWarn}</div>
          <div class="comp-kpi-label">SD Card Warnings</div>
        </div>
      </div>`;

    // Asset status table
    const assetTableRows = assetRows.map((row, idx) =>
      this._renderAssetRow(row, idx)
    ).join('');

    const assetTable = `
      <div class="card table-card">
        <div class="card-header">
          <span class="card-title">Asset Status — GPS &amp; Camera</span>
          <span class="card-subtitle">${assetRows.length} assets</span>
          <input class="search-input" id="comp-asset-search" placeholder="Search asset or driver..." />
          <button class="btn-export-csv" id="btn-asset-csv">⬆ Export</button>
        </div>
        <div class="table-scroll">
          <table class="data-table comp-asset-table" id="comp-asset-table">
            <thead>
              <tr>
                <th data-col="0">ASSET NAME ↕</th>
                <th data-col="1">GPS STATUS ↕</th>
                <th data-col="2">LAST GPS SEEN ↕</th>
                <th data-col="3">CAMERA ↕</th>
                <th data-col="4">CAM STATUS ↕</th>
                <th data-col="5">CAM HEALTH ↕</th>
                <th data-col="6">LAST CAM SEEN ↕</th>
                <th data-col="7">CURRENT DRIVER ↕</th>
              </tr>
            </thead>
            <tbody id="comp-asset-tbody">${assetTableRows}</tbody>
          </table>
        </div>
      </div>`;

    // Group summary table
    const groupTableRows = groupRows.map(row => `
      <tr>
        <td>${row.name}</td>
        <td>${row.vehicles}</td>
        <td>${row.cameras}</td>
        <td>${row.gpsOffline > 0
          ? `<span class="count-badge alert">${row.gpsOffline}</span>` : '0'}</td>
        <td>${row.camOffline > 0
          ? `<span class="count-badge alert">${row.camOffline}</span>` : '0'}</td>
        <td>${row.daysDriven}</td>
        <td>${Utils.formatNumber(row.miles)} mi</td>
        <td>${Utils.secondsToHMS(row.drivSec)}</td>
        <td>${Utils.secondsToHMS(row.idleSec)}</td>
        <td>${utilBar(row.utilPct)}</td>
      </tr>`).join('');

    const groupTable = `
      <div class="card table-card">
        <div class="card-header">
          <span class="card-title">Group Summary</span>
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>GROUP</th>
                <th>VEHICLES</th>
                <th>CAMERAS</th>
                <th>GPS OFFLINE 5+ DAYS</th>
                <th>CAM OFFLINE 5+ DAYS</th>
                <th>DAYS DRIVEN</th>
                <th>MILES DRIVEN</th>
                <th>HOURS DRIVEN</th>
                <th>IDLING TIME</th>
                <th>UTILIZATION %</th>
              </tr>
            </thead>
            <tbody>${groupTableRows}</tbody>
          </table>
        </div>
      </div>`;

    // Driver utilization table
    const driverTableRows = driverRows.map((row, idx) =>
      this._renderDriverRow(row, idx)
    ).join('');

    const driverTable = `
      <div class="card table-card">
        <div class="card-header">
          <span class="card-title">Driver Utilization</span>
          <span class="card-subtitle">${driverRows.length} drivers</span>
          <input class="search-input" id="comp-driver-search" placeholder="Search driver or vehicle..." />
        </div>
        <div class="table-scroll">
          <table class="data-table" id="comp-driver-table">
            <thead>
              <tr>
                <th data-col="0">DRIVER ↕</th>
                <th data-col="1">VEHICLE ↕</th>
                <th data-col="2">GPS ↕</th>
                <th data-col="3">CAMERA ↕</th>
                <th data-col="4">ODOMETER ↕</th>
                <th data-col="5">DAYS DRIVEN ↕</th>
                <th data-col="6">MILES ↕</th>
                <th data-col="7">HOURS DRIVEN ↕</th>
                <th data-col="8">IDLING ↕</th>
                <th data-col="9">UTILIZATION % ↕</th>
              </tr>
            </thead>
            <tbody id="comp-driver-tbody">${driverTableRows}</tbody>
          </table>
        </div>
      </div>`;

    return `<div class="report-page">
      ${kpiCards}
      ${assetTable}
      ${groupTable}
      ${driverTable}
    </div>`;
  },

  // ---- ASSET ROW ----
  _renderAssetRow(row, idx) {
    const gpsBadge = row.gpsOnline
      ? '<span class="status-badge status-online">● Online</span>'
      : `<span class="status-badge status-offline">● Offline${row.gpsDaysOffline !== null ? ' ' + row.gpsDaysOffline + 'd' : ''}</span>`;

    const camCell = row.hasCam
      ? '<span class="status-badge status-has-cam">📷 Yes</span>'
      : '<span class="status-badge status-no-cam">— None</span>';

    const camStatusCell = row.hasCam
      ? (row.camOnline
          ? '<span class="status-badge status-online">● Online</span>'
          : `<span class="status-badge status-offline">● Offline${row.camDaysOffline !== null ? ' ' + row.camDaysOffline + 'd' : ''}</span>`)
      : '<span class="comp-na">—</span>';

    const healthColors = {
      Healthy:  { bg: '#C6F6D5', color: '#276749' },
      Warning:  { bg: '#FEFCBF', color: '#975A16' },
      Critical: { bg: '#FED7D7', color: '#C53030' },
      Unknown:  { bg: '#F5F5F5', color: '#757575' },
    };
    const hc = row.sdHealth && row.hasCam
      ? healthColors[row.sdHealth] || healthColors.Unknown
      : null;
    const camHealthCell = hc
      ? `<span class="colored-badge" style="background:${hc.bg};color:${hc.color}">${row.sdHealth}</span>`
      : '<span class="comp-na">—</span>';

    const fmt = (d) => d
      ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';

    return `<tr data-idx="${idx}">
      <td class="link-text">${row.name}</td>
      <td>${gpsBadge}</td>
      <td class="comp-date">${fmt(row.gpsLastSeen)}</td>
      <td>${camCell}</td>
      <td>${camStatusCell}</td>
      <td>${camHealthCell}</td>
      <td class="comp-date">${row.hasCam ? fmt(row.camLastSeen) : '—'}</td>
      <td>${row.driverName}</td>
    </tr>`;
  },

  // ---- DRIVER ROW ----
  _renderDriverRow(row, idx) {
    const utilBar = (pct) => {
      const color = pct >= 70 ? '#673AB7' : pct >= 40 ? '#2196F3' : '#90CAF9';
      return `<div class="util-bar-wrap">
        <div class="util-bar" style="width:${Math.min(pct,100)}%;background:${color}"></div>
        <span>${pct}%</span>
      </div>`;
    };

    const gpsCell = row.hasGPS
      ? (row.gpsOnline
          ? '<span class="status-badge status-online">● GPS</span>'
          : '<span class="status-badge status-offline">● GPS Off</span>')
      : '<span class="comp-na">—</span>';

    const camCell = row.hasCam
      ? '<span class="status-badge status-has-cam">📷</span>'
      : '<span class="comp-na">—</span>';

    return `<tr data-idx="${idx}">
      <td class="link-text">${row.name}</td>
      <td>${row.vehicleName}</td>
      <td>${gpsCell}</td>
      <td>${camCell}</td>
      <td>${row.odometer > 0 ? Utils.formatNumber(row.odometer) + ' mi' : '—'}</td>
      <td>${row.daysDriven}</td>
      <td>${Utils.formatNumber(row.miles)} mi</td>
      <td>${Utils.secondsToHMS(row.drivSec)}</td>
      <td>${Utils.secondsToHMS(row.idleSec)}</td>
      <td>${utilBar(row.utilPct)}</td>
    </tr>`;
  },

  // ============================================================
  // SORT — full client-side A-Z / Z-A on any column
  // ============================================================
  _setupAssetSort(assetRows) {
    const table = document.getElementById('comp-asset-table');
    if (!table) return;

    table.querySelectorAll('thead th').forEach((th, colIndex) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        this._assetSortDir = this._assetSortCol === colIndex ? this._assetSortDir * -1 : 1;
        this._assetSortCol = colIndex;
        this._sortTableBody('comp-asset-tbody', colIndex, this._assetSortDir);
        this._updateSortHeaders(table, colIndex, this._assetSortDir);
      });
    });
  },

  _setupDriverSort(driverRows) {
    const table = document.getElementById('comp-driver-table');
    if (!table) return;

    table.querySelectorAll('thead th').forEach((th, colIndex) => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        this._driverSortDir = this._driverSortCol === colIndex ? this._driverSortDir * -1 : 1;
        this._driverSortCol = colIndex;
        this._sortTableBody('comp-driver-tbody', colIndex, this._driverSortDir);
        this._updateSortHeaders(table, colIndex, this._driverSortDir);
      });
    });
  },

  _sortTableBody(tbodyId, colIndex, dir) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const aText = (a.cells[colIndex]?.textContent || '').trim();
      const bText = (b.cells[colIndex]?.textContent || '').trim();
      const aNum  = parseFloat(aText.replace(/[^0-9.-]/g, ''));
      const bNum  = parseFloat(bText.replace(/[^0-9.-]/g, ''));
      if (!isNaN(aNum) && !isNaN(bNum)) return (aNum - bNum) * dir;
      return aText.localeCompare(bText) * dir;
    });
    rows.forEach(r => tbody.appendChild(r));
  },

  _updateSortHeaders(table, activeCol, dir) {
    table.querySelectorAll('thead th').forEach((th, i) => {
      th.textContent = th.textContent.replace(/[ ↑↓↕]+$/, '').trim();
      th.textContent += i === activeCol ? (dir === 1 ? ' ↑' : ' ↓') : ' ↕';
    });
  },

  // ============================================================
  // SEARCH
  // ============================================================
  _setupSearch(inputId, tbodyId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;
      tbody.querySelectorAll('tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  },

  // ============================================================
  // EXPORT
  // ============================================================
  _setupExport(assetRows, driverRows) {
    const btn = document.getElementById('btn-asset-csv');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const headers = ['Asset Name','GPS Online','Last GPS Seen','Has Camera',
        'Camera Online','Camera Health','Last Cam Seen','Current Driver'];
      const rows = assetRows.map(r => [
        r.name,
        r.gpsOnline ? 'Yes' : 'No',
        r.gpsLastSeen ? r.gpsLastSeen.toISOString() : '',
        r.hasCam ? 'Yes' : 'No',
        r.camOnline !== null ? (r.camOnline ? 'Yes' : 'No') : '',
        r.sdHealth || '',
        r.camLastSeen ? r.camLastSeen.toISOString() : '',
        r.driverName,
      ]);
      const csv = [headers, ...rows]
        .map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))
        .join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'asset-status-' + new Date().toISOString().split('T')[0] + '.csv';
      a.click();
    });
  },
};

window.CompliancePage = CompliancePage;
