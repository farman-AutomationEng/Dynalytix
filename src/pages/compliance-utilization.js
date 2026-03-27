/**
 * compliance-utilization.js — Compliance & Utilization Report
 *
 * Columns:
 * Group/Driver | Vehicles | Cameras | GPS Offline 5+ Days | Cameras Offline 5+ Days |
 * Days Driven | Miles Driven | Hours Driven | Idling Time | Utilization % (Days Driven)
 */

const CompliancePage = {

  async render(container, { api, fromDate, toDate, period, groupIds }) {

    const [devices, groups, drivers, trips, deviceStatusList] = await Promise.all([
      api.getDevices(groupIds),
      api.getGroups(),
      api.getDrivers(groupIds),
      api.getTrips(fromDate, toDate, groupIds),
      api.getDeviceStatusInfo(groupIds)
    ]);

    const cameraDevices = devices.filter(d =>
      d.name?.toLowerCase().includes('surfsight') ||
      d.deviceType?.toLowerCase().includes('camera')
    );

    const tripAgg = api.aggregateTrips(trips);

    // Period total days (for utilization%)
    const totalPeriodDays = Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24));

    // Driver rows
    const driverRows = drivers.map(d => {
      const dTrips = trips.filter(t => t.driver?.id === d.id);
      const miles   = dTrips.reduce((s, t) => s + Utils.metersToMiles(t.distance || 0), 0);
      const drivSec = dTrips.reduce((s, t) => s + (t.drivingDuration || 0), 0);
      const idleSec = dTrips.reduce((s, t) => s + (t.idlingDuration || 0), 0);
      const daysDriven = new Set(dTrips.map(t => (t.start || '').split('T')[0])).size;
      const utilPct = totalPeriodDays > 0 ? Math.round((daysDriven / totalPeriodDays) * 100) : 0;

      // Find vehicle
      const devId = dTrips[0]?.device?.id;
      const vehicle = devId ? devices.find(dev => dev.id === devId) : null;
      const devStatus = vehicle ? deviceStatusList.find(ds => ds.device?.id === vehicle.id) : null;
      const hasGPS = !!vehicle;
      const hasCam = vehicle ? cameraDevices.some(c => c.id === vehicle.id) : false;
      const odometer = vehicle ? Math.round((vehicle.odometer || 0) * 0.000621371) : 0;

      return {
        name: ((d.firstName || '') + ' ' + (d.lastName || d.name || '')).trim(),
        vehicleName: vehicle?.name || '-',
        hasGPS: hasGPS ? '✓' : '✗',
        hasCamera: hasCam ? '✓' : '✗',
        odometer,
        daysDriven,
        miles,
        hoursString: Utils.secondsToHMS(drivSec),
        idleString:  Utils.secondsToHMS(idleSec),
        utilPct
      };
    });

    // Group rows
    const groupRows = groups.map(g => {
      const gDevices = devices.filter(d => (d.groups || []).some(dg => dg.id === g.id));
      const gCameras = gDevices.filter(d => cameraDevices.some(c => c.id === d.id));
      const gDriverIds = drivers.filter(d => (d.groups || []).some(dg => dg.id === g.id)).map(d => d.id);

      const gOfflineGPS = deviceStatusList.filter(ds => {
        const inGroup = gDevices.some(dev => dev.id === ds.device?.id);
        const offline5 = !ds.isDeviceCommunicating ||
          (ds.lastCommunicationDate && (new Date() - new Date(ds.lastCommunicationDate)) > 5 * 24 * 3600 * 1000);
        return inGroup && offline5;
      }).length;

      const gTrips = trips.filter(t => gDriverIds.includes(t.driver?.id));
      const gMiles   = gTrips.reduce((s, t) => s + Utils.metersToMiles(t.distance || 0), 0);
      const gDrivSec = gTrips.reduce((s, t) => s + (t.drivingDuration || 0), 0);
      const gIdleSec = gTrips.reduce((s, t) => s + (t.idlingDuration || 0), 0);
      const gDays    = new Set(gTrips.map(t => (t.start || '').split('T')[0])).size;
      const gUtil    = totalPeriodDays > 0 ? Math.round((gDays / totalPeriodDays) * 100) : 0;

      return {
        name: g.name,
        vehicles: gDevices.length,
        cameras: gCameras.length,
        gpsOffline: gOfflineGPS,
        camOffline: 0,
        daysDriven: gDays,
        miles: gMiles,
        hoursString: Utils.secondsToHMS(gDrivSec),
        idleString:  Utils.secondsToHMS(gIdleSec),
        utilPct: gUtil
      };
    });

    container.innerHTML = this.buildHTML({ groupRows, driverRows, totalPeriodDays });
    this.setupSearch();
  },

  buildHTML({ groupRows, driverRows, totalPeriodDays }) {
    const utilBar = (pct) => {
      const color = pct >= 70 ? '#673AB7' : pct >= 40 ? '#2196F3' : '#90CAF9';
      return `<div class="util-bar-wrap">
        <div class="util-bar" style="width:${pct}%;background:${color}"></div>
        <span>${pct}%</span>
      </div>`;
    };

    const coloredVal = (val, type) => {
      if (type === 'days') {
        const color = val >= 15 ? '#673AB7' : val >= 8 ? '#9C27B0' : '#CE93D8';
        return `<span class="colored-badge" style="background:${color}22;color:${color}">${val}</span>`;
      }
      if (type === 'miles') {
        const color = val >= 300 ? '#673AB7' : val >= 150 ? '#9C27B0' : '#CE93D8';
        return `<span class="colored-badge" style="background:${color}22;color:${color}">${Utils.formatNumber(val)}</span>`;
      }
      if (type === 'hours') {
        return `<span class="colored-badge blue">${val}</span>`;
      }
      if (type === 'idle') {
        return `<span class="colored-badge teal">${val}</span>`;
      }
      return val;
    };

    const groupRows_ = groupRows.map(row => `
      <tr>
        <td>${row.name}</td>
        <td>${row.vehicles}</td>
        <td>${row.cameras}</td>
        <td>${row.gpsOffline > 0 ? `<span class="count-badge alert">${row.gpsOffline}</span>` : 0}</td>
        <td>${row.camOffline}</td>
        <td>${coloredVal(row.daysDriven, 'days')}</td>
        <td>${coloredVal(row.miles, 'miles')}</td>
        <td>${coloredVal(row.hoursString, 'hours')}</td>
        <td>${coloredVal(row.idleString, 'idle')}</td>
        <td>${utilBar(row.utilPct)}</td>
      </tr>
    `).join('');

    const driverRows_ = driverRows.map(row => `
      <tr>
        <td class="link-text">${row.name}</td>
        <td>${row.hasGPS}</td>
        <td>${row.hasCamera}</td>
        <td>${row.odometer > 0 ? Utils.formatNumber(row.odometer) : '-'}</td>
        <td>${coloredVal(row.daysDriven, 'days')}</td>
        <td>${coloredVal(row.miles, 'miles')}</td>
        <td>${coloredVal(row.hoursString, 'hours')}</td>
        <td>${coloredVal(row.idleString, 'idle')}</td>
        <td>${utilBar(row.utilPct)}</td>
      </tr>
    `).join('');

    return `
    <div class="report-page">

      <!-- GROUP TABLE -->
      <div class="card table-card">
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>GROUP ▼</th>
                <th>VEHICLES ▼</th>
                <th>CAMERAS ▼</th>
                <th>GPS OFFLINE 5+ DAYS ▼</th>
                <th>CAMERAS OFFLINE 5+ DAYS ▼</th>
                <th>DAYS DRIVEN ▼</th>
                <th>MILES DRIVEN ▼</th>
                <th>HOURS DRIVEN ▼</th>
                <th>IDLING TIME ▼</th>
                <th>UTILIZATION % ▼</th>
              </tr>
            </thead>
            <tbody>${groupRows_}</tbody>
          </table>
        </div>
      </div>

      <!-- DRIVER TABLE -->
      <div class="card table-card" style="margin-top:24px">
        <div class="card-header">
          <span class="card-title">${driverRows.length} Drivers</span>
          <input class="search-input" id="comp-search" placeholder="Search vehicle or driver..." />
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>CURRENT DRIVER ↕</th>
                <th>GPS ▼</th>
                <th>CAMERA ▼</th>
                <th>ODOMETER ▼</th>
                <th>DAYS DRIVEN ▼</th>
                <th>MILES DRIVEN ▼</th>
                <th>HOURS DRIVEN ▼</th>
                <th>IDLING TIME ▼</th>
                <th>UTILIZATION % ▼</th>
              </tr>
            </thead>
            <tbody id="comp-tbody">${driverRows_}</tbody>
          </table>
        </div>
      </div>

    </div>
    `;
  },

  setupSearch() {
    const input = document.getElementById('comp-search');
    if (!input) return;
    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const tbody = document.getElementById('comp-tbody');
      if (!tbody) return;
      Array.from(tbody.querySelectorAll('tr')).forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
};

window.CompliancePage = CompliancePage;
