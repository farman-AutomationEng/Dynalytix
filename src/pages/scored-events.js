/**
 * scored-events.js — Scored Events Dashboard
 *
 * Event type KPI cards (count + trend):
 * Hard Acceleration, Harsh Braking, Harsh Cornering, Speeding,
 * Excessive Speeding, Seat Belt, Backing Up When Leaving,
 * Possible Collision, Major Collision, Idling,
 * Distracted Driving, Food and Drink, Lane Departure Warning,
 * Tailgating, Device Button Is Pressed, Idle (HH:MM:SS)
 *
 * + Driver/Vehicle table with all event columns
 */

const ScoredEventsPage = {

  // All tracked event types
  EVENT_TYPES: [
    { key: 'Hard Acceleration',        label: 'Hard Acceleration',        icon: '⬆️' },
    { key: 'Harsh Braking',            label: 'Harsh Braking',            icon: '🛑' },
    { key: 'Harsh Cornering',          label: 'Harsh Cornering',          icon: '↩️' },
    { key: 'Speeding',                 label: 'Speeding',                 icon: '🚀' },
    { key: 'Excessive Speeding',       label: 'Excessive Speeding',       icon: '⚡' },
    { key: 'Seat Belt',                label: 'Seat Belt',                icon: '🔒' },
    { key: 'Backing Up When Leaving',  label: 'Backing Up When Leaving',  icon: '🔄' },
    { key: 'Possible Collision',       label: 'Possible Collision',       icon: '💥' },
    { key: 'Major Collision',          label: 'Major Collision',          icon: '🚨' },
    { key: 'Idling',                   label: 'Idling',                   icon: '⏸️' },
    { key: 'Distracted Driving',       label: 'Distracted Driving',       icon: '📱' },
    { key: 'Food and Drink',           label: 'Food and Drink',           icon: '🍔' },
    { key: 'Lane Departure Warning',   label: 'Lane Departure Warning',   icon: '🛣️' },
    { key: 'Tailgating',               label: 'Tailgating',               icon: '🚗' },
    { key: 'Device Button Is Pressed', label: 'Device Button Is Pressed', icon: '🔘' },
    { key: 'Cell Phone Use',           label: 'Cell Phone Use',           icon: '📞' },
  ],

  async render(container, { api, fromDate, toDate, period, groupIds, vehicleMode }) {

    // ---- FETCH DATA ----
    const periodMs = toDate - fromDate;
    const prevTo = new Date(fromDate);
    const prevFrom = new Date(fromDate.getTime() - periodMs);

    const [events, prevEvents, ruleMap, drivers, devices, trips] = await Promise.all([
      api.getExceptionEvents(fromDate, toDate, groupIds),
      api.getExceptionEvents(prevFrom, prevTo, groupIds),
      api.getRuleMap(),
      api.getDrivers(groupIds),
      api.getDevices(groupIds),
      api.getTrips(fromDate, toDate, groupIds)
    ]);

    // ---- AGGREGATE EVENT COUNTS ----
    const countByType = {};
    const prevCountByType = {};
    events.forEach(e => { const n = ruleMap[e.rule?.id] || 'Unknown'; countByType[n] = (countByType[n]||0)+1; });
    prevEvents.forEach(e => { const n = ruleMap[e.rule?.id] || 'Unknown'; prevCountByType[n] = (prevCountByType[n]||0)+1; });

    // Idling duration (from trips)
    const totalIdleSec = trips.reduce((sum, t) => sum + (t.idlingDuration || 0), 0);
    const prevIdleSec = 0; // Simplified

    // ---- DRIVER / VEHICLE ROWS ----
    const tripAgg = api.aggregateTrips(trips);
    const eventsByEntity = vehicleMode
      ? api.groupEventsByDevice(events)
      : api.groupEventsByDriver(events);

    const entities = vehicleMode ? devices : drivers;

    const rows = entities.map(entity => {
      const entityEvents = eventsByEntity[entity.id] || [];
      const row = {
        name: vehicleMode ? entity.name : ((entity.firstName || '') + ' ' + (entity.lastName || entity.name || '')).trim(),
        vehicleName: vehicleMode ? entity.name : '-'
      };
      this.EVENT_TYPES.forEach(et => {
        row[et.key] = entityEvents.filter(e => (ruleMap[e.rule?.id] || '') === et.key).length;
      });
      // Idling time for this entity
      const entityTrips = trips.filter(t => vehicleMode ? t.device?.id === entity.id : t.driver?.id === entity.id);
      row['idleTime'] = entityTrips.reduce((sum, t) => sum + (t.idlingDuration || 0), 0);
      return row;
    }).filter(r => Object.values(r).some(v => typeof v === 'number' && v > 0));

    // ---- RENDER ----
    container.innerHTML = this.buildHTML({
      countByType, prevCountByType, totalIdleSec, rows, vehicleMode
    });
  },

  buildHTML({ countByType, prevCountByType, totalIdleSec, rows, vehicleMode }) {
    // KPI Cards
    const kpiCards = this.EVENT_TYPES.map(et => {
      const count = countByType[et.key] || 0;
      const prev  = prevCountByType[et.key] || 0;
      const trend = Utils.calcTrend(count, prev);
      const isAlert = count > 0 && (et.key.includes('Collision') || et.key.includes('Seat Belt') || et.key.includes('Phone'));
      return `
        <div class="card kpi-event-card ${isAlert ? 'alert' : ''}">
          <div class="kpi-event-label">${et.label}</div>
          <div class="kpi-event-count">${count}</div>
          ${count > 0 ? `<div class="kpi-event-trend">${Utils.trendBadge(trend)}</div>` : ''}
        </div>
      `;
    });

    // Idle time card
    kpiCards.push(`
      <div class="card kpi-event-card">
        <div class="kpi-event-label">Idle (HH:MM:SS)</div>
        <div class="kpi-event-count small">${Utils.secondsToHMS(totalIdleSec)}</div>
      </div>
    `);

    // Table columns
    const cols = this.EVENT_TYPES.map(et => et.label);

    return `
      <div class="scored-events-page">

        <div class="section-header">
          <h3>Event Summary</h3>
        </div>

        <!-- KPI CARDS GRID -->
        <div class="kpi-events-grid">
          ${kpiCards.join('')}
        </div>

        <!-- DRIVER/VEHICLE TABLE -->
        <div class="card table-card" style="margin-top:24px">
          <div class="card-header">
            <span class="card-title">${rows.length} ${vehicleMode ? 'Vehicles' : 'Units'}</span>
            <input class="search-input" id="entity-search" placeholder="Search vehicle or driver..." />
          </div>
          <div class="table-scroll">
            <table class="data-table dense-table" id="events-table">
              <thead>
                <tr>
                  <th>${vehicleMode ? 'VEHICLE' : 'CURRENT DRIVER'} ↕</th>
                  ${cols.map(c => `<th>${c.toUpperCase()} ↕</th>`).join('')}
                  <th>IDLE TIME ↕</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(row => `
                  <tr>
                    <td class="link-text">${row.name || '-'}</td>
                    ${this.EVENT_TYPES.map(et => {
                      const v = row[et.key] || 0;
                      const isHighAlert = v > 10 && (et.key.includes('Collision') || et.key.includes('Seat') || et.key.includes('Phone'));
                      const bgColor = isHighAlert ? '#F4433622' : v > 0 ? '#FF9800' + '22' : '';
                      const color = isHighAlert ? '#F44336' : v > 0 ? '#FF9800' : '#757575';
                      return `<td>${v > 0 ? `<span class="count-badge" style="background:${bgColor};color:${color}">${v}</span>` : 0}</td>`;
                    }).join('')}
                    <td>${Utils.secondsToHMS(row.idleTime)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;
  }
};

window.ScoredEventsPage = ScoredEventsPage;
