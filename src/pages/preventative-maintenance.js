/**
 * preventative-maintenance.js — PM Report
 *
 * Columns per Group/Vehicle:
 * Vehicles | Cameras | Engine Light ON | Engine Abuse |
 * Battery Drain | Engine Oil < 5% | Coolant Temp Critical | Low Tire Pressure
 */

const PMPage = {

  async render(container, { api, fromDate, toDate, period, groupIds }) {

    // Fetch all data
    const [
      devices, groups, drivers,
      engineLightData, batteryData, tirePressureData,
      engineOilData, coolantData, deviceStatusList
    ] = await Promise.all([
      api.getDevices(groupIds),
      api.getGroups(),
      api.getDrivers(groupIds),
      api.getEngineLightEvents(fromDate, toDate, groupIds),
      api.getBatteryEvents(fromDate, toDate, groupIds),
      api.getTirePressureEvents(fromDate, toDate, groupIds),
      api.getEngineOilEvents(fromDate, toDate, groupIds),
      api.getCoolantTempEvents(fromDate, toDate, groupIds),
      api.getDeviceStatusInfo(groupIds)
    ]);

    // Camera devices
    const cameraDevices = devices.filter(d =>
      d.name?.toLowerCase().includes('surfsight') ||
      d.deviceType?.toLowerCase().includes('camera') ||
      d.name?.toLowerCase().includes('cam')
    );

    // Device-level PM data
    const getDeviceCount = (statusDataArr, deviceId) =>
      statusDataArr.filter(s => s.device?.id === deviceId).length;

    const deviceRows = devices.map(dev => {
      const hasCam = cameraDevices.some(c => c.id === dev.id);
      const devStatus = deviceStatusList.find(ds => ds.device?.id === dev.id);
      const currentDriver = drivers.find(d => {
        const devGroups = (dev.groups || []).map(g => g.id);
        return (d.groups || []).some(dg => devGroups.includes(dg.id));
      });

      return {
        id: dev.id,
        name: dev.name || '-',
        driver: currentDriver ? ((currentDriver.firstName || '') + ' ' + (currentDriver.lastName || '')).trim() : '-',
        gpsActive: devStatus?.isDeviceCommunicating ? '✓' : '✗',
        hasCamera: hasCam ? '✓' : '✗',
        engineLight: getDeviceCount(engineLightData, dev.id),
        engineAbuse: 0, // Custom rule needed
        batteryDrain: getDeviceCount(batteryData, dev.id),
        engineOil: getDeviceCount(engineOilData, dev.id),
        coolantTemp: getDeviceCount(coolantData, dev.id),
        tirePressure: getDeviceCount(tirePressureData, dev.id)
      };
    });

    // Group-level aggregation
    const groupRows = groups.map(g => {
      const gDevices = devices.filter(d => (d.groups || []).some(dg => dg.id === g.id));
      const gCameras = gDevices.filter(d => cameraDevices.some(c => c.id === d.id));

      const sumField = (field) => deviceRows
        .filter(r => gDevices.some(d => d.id === r.id))
        .reduce((sum, r) => sum + (r[field] || 0), 0);

      return {
        name: g.name,
        vehicles: gDevices.length,
        cameras: gCameras.length,
        engineLight: sumField('engineLight'),
        engineAbuse: sumField('engineAbuse'),
        batteryDrain: sumField('batteryDrain'),
        engineOil: sumField('engineOil'),
        coolantTemp: sumField('coolantTemp'),
        tirePressure: sumField('tirePressure')
      };
    });

    container.innerHTML = this.buildHTML({ groupRows, deviceRows });
    this.setupSearch();
  },

  buildHTML({ groupRows, deviceRows }) {
    const cols = [
      { key: 'vehicles', label: 'VEHICLES' },
      { key: 'cameras', label: 'CAMERAS' },
      { key: 'engineLight', label: 'ENGINE LIGHT ON' },
      { key: 'engineAbuse', label: 'ENGINE ABUSE' },
      { key: 'batteryDrain', label: 'BATTERY DRAIN' },
      { key: 'engineOil', label: 'ENGINE OIL < 5%' },
      { key: 'coolantTemp', label: 'COOLANT TEMP CRITICAL' },
      { key: 'tirePressure', label: 'LOW TIRE PRESSURE' }
    ];

    const renderCell = (val, key) => {
      if (key === 'vehicles' || key === 'cameras') return `<td>${val}</td>`;
      if (val > 0) {
        const color = key === 'tirePressure' || key === 'engineLight' ? '#F44336' : '#FF9800';
        return `<td><span class="count-badge" style="background:${color}22;color:${color}">${val}</span></td>`;
      }
      return `<td>0</td>`;
    };

    const groupTableRows = groupRows.map(row => `
      <tr>
        <td>${row.name}</td>
        ${cols.map(c => renderCell(row[c.key] || 0, c.key)).join('')}
      </tr>
    `).join('');

    const deviceTableRows = deviceRows.map(row => `
      <tr>
        <td class="link-text">${row.driver}</td>
        <td>${row.gpsActive}</td>
        <td>${row.hasCamera}</td>
        ${renderCell(row.engineLight, 'engineLight')}
        ${renderCell(row.engineAbuse, 'engineAbuse')}
        ${renderCell(row.batteryDrain, 'batteryDrain')}
        ${renderCell(row.engineOil, 'engineOil')}
        ${renderCell(row.coolantTemp, 'coolantTemp')}
        ${renderCell(row.tirePressure, 'tirePressure')}
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
                ${cols.map(c => `<th>${c.label} ▼</th>`).join('')}
              </tr>
            </thead>
            <tbody>${groupTableRows}</tbody>
          </table>
        </div>
      </div>

      <!-- DEVICE TABLE -->
      <div class="card table-card" style="margin-top:24px">
        <div class="card-header">
          <span class="card-title">${deviceRows.length} Vehicles</span>
          <input class="search-input" id="pm-search" placeholder="Search vehicle or driver..." />
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>CURRENT DRIVER ↕</th>
                <th>GPS ▼</th>
                <th>CAMERA ▼</th>
                ${cols.slice(2).map(c => `<th>${c.label} ▼</th>`).join('')}
              </tr>
            </thead>
            <tbody id="pm-tbody">${deviceTableRows}</tbody>
          </table>
        </div>
      </div>

    </div>
    `;
  },

  setupSearch() {
    const input = document.getElementById('pm-search');
    if (!input) return;
    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const tbody = document.getElementById('pm-tbody');
      if (!tbody) return;
      Array.from(tbody.querySelectorAll('tr')).forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
};

window.PMPage = PMPage;
