/**
 * coaching-engagement.js — Coaching & Engagement Report
 *
 * Columns:
 * Driver | Vehicle | Coaching Sessions | Views | Last Coached | Score | Trend
 *
 * + Coaching trend chart
 * + Assignment tracking
 */

const CoachingPage = {

  async render(container, { api, fromDate, toDate, period, groupIds }) {

    const [coachingLogs, drivers, devices, events, ruleMap, trips] = await Promise.all([
      api.getAnnotationLogs(fromDate, toDate, groupIds),
      api.getDrivers(groupIds),
      api.getDevices(groupIds),
      api.getExceptionEvents(fromDate, toDate, groupIds),
      api.getRuleMap(),
      api.getTrips(fromDate, toDate, groupIds)
    ]);

    const prevTo = new Date(fromDate);
    const prevFrom = new Date(fromDate.getTime() - (toDate - fromDate));
    const prevEvents = await api.getExceptionEvents(prevFrom, prevTo, groupIds);
    const prevCoaching = await api.getAnnotationLogs(prevFrom, prevTo, groupIds);

    // Score per driver
    const driverEventMap = api.groupEventsByDriver(events);
    const prevDriverEventMap = api.groupEventsByDriver(prevEvents);

    // Coaching per driver
    const coachByDriver = {};
    coachingLogs.forEach(log => {
      const dId = log.driver?.id || log.user?.id || 'unknown';
      if (!coachByDriver[dId]) coachByDriver[dId] = { sessions: [], views: 0 };
      coachByDriver[dId].sessions.push(log);
      if (log.viewed) coachByDriver[dId].views++;
    });

    // Coaching trend (last 6 periods)
    const periods6 = Utils.getLast6Periods();
    const coachingTrend = periods6.map(p => ({
      label: p.label,
      sessions: coachingLogs.filter(l => {
        const d = new Date(l.dateTime || l.logTime || l.date);
        return d >= p.fromDate && d <= p.toDate;
      }).length,
      views: coachingLogs.filter(l => {
        const d = new Date(l.dateTime || l.logTime || l.date);
        return d >= p.fromDate && d <= p.toDate && l.viewed;
      }).length
    }));

    // KPI summary
    const totalSessions = coachingLogs.length;
    const totalViews    = coachingLogs.filter(l => l.viewed).length;
    const viewRate      = totalSessions > 0 ? Math.round((totalViews / totalSessions) * 100) : 0;
    const prevSessions  = prevCoaching.length;
    const sessionTrend  = Utils.calcTrend(totalSessions, prevSessions);

    // Driver rows
    const deviceDriverMap = {};
    trips.forEach(t => {
      if (t.device?.id && t.driver?.id) deviceDriverMap[t.device.id] = t.driver.id;
    });

    const driverRows = drivers.map(d => {
      const dEvts = driverEventMap[d.id] || [];
      const prevEvts = prevDriverEventMap[d.id] || [];
      const score = Utils.calculateScore(dEvts, ruleMap);
      const prevScore = Utils.calculateScore(prevEvts, ruleMap);
      const trend = Utils.calcTrend(score, prevScore);
      const coaching = coachByDriver[d.id] || { sessions: [], views: 0 };
      const lastCoached = coaching.sessions.length > 0
        ? coaching.sessions.sort((a, b) => new Date(b.dateTime || b.logTime) - new Date(a.dateTime || a.logTime))[0]
        : null;
      const vehicle = devices.find(dev => deviceDriverMap[dev.id] === d.id);

      return {
        name: ((d.firstName || '') + ' ' + (d.lastName || d.name || '')).trim(),
        vehicleName: vehicle?.name || '-',
        sessions: coaching.sessions.length,
        views: coaching.views,
        lastCoached: lastCoached ? Utils.formatShortDate(new Date(lastCoached.dateTime || lastCoached.logTime)) : 'Never',
        score,
        trend
      };
    });

    container.innerHTML = this.buildHTML({ totalSessions, totalViews, viewRate, sessionTrend, coachingTrend, driverRows });
    this.initTrendChart('coaching-trend-canvas', coachingTrend);
    this.setupSearch();
  },

  buildHTML({ totalSessions, totalViews, viewRate, sessionTrend, coachingTrend, driverRows }) {
    return `
    <div class="report-page">

      <!-- KPI SUMMARY -->
      <div class="kpi-row">
        <div class="card kpi-small-card">
          <div class="kpi-label">Total Sessions</div>
          <div class="kpi-big">${totalSessions}</div>
          <div>${Utils.trendBadge(sessionTrend)}</div>
        </div>
        <div class="card kpi-small-card">
          <div class="kpi-label">Total Views</div>
          <div class="kpi-big">${totalViews}</div>
        </div>
        <div class="card kpi-small-card">
          <div class="kpi-label">View Rate</div>
          <div class="kpi-big">${viewRate}%</div>
        </div>
        <div class="card kpi-small-card">
          <div class="kpi-label">Drivers Coached</div>
          <div class="kpi-big">${driverRows.filter(r => r.sessions > 0).length}</div>
        </div>
      </div>

      <!-- TREND CHART -->
      <div class="card chart-card">
        <div class="card-header">
          <span class="card-title">Coaching Activity Trend</span>
          <span class="card-subtitle">Last 6 periods</span>
        </div>
        <canvas id="coaching-trend-canvas" height="160"></canvas>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot blue"></span>Sessions</span>
          <span class="legend-item"><span class="legend-dot green"></span>Views</span>
        </div>
      </div>

      <!-- DRIVER TABLE -->
      <div class="card table-card" style="margin-top:24px">
        <div class="card-header">
          <span class="card-title">${driverRows.length} Drivers</span>
          <input class="search-input" id="coach-search" placeholder="Search driver..." />
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>DRIVER ↕</th>
                <th>VEHICLE ↕</th>
                <th>COACHING SESSIONS ↓</th>
                <th>VIEWS ↓</th>
                <th>LAST COACHED ↕</th>
                <th>SCORE ↓</th>
                <th>TREND ↕</th>
              </tr>
            </thead>
            <tbody id="coach-tbody">
              ${driverRows.map(row => `
                <tr>
                  <td class="link-text">${row.name}</td>
                  <td>${row.vehicleName}</td>
                  <td>${row.sessions > 0 ? `<span class="count-badge blue">${row.sessions}</span>` : 0}</td>
                  <td>${row.views}</td>
                  <td>${row.lastCoached}</td>
                  <td>${Utils.scoreBadge(row.score || null)}</td>
                  <td>${Utils.trendBadge(row.trend)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
    `;
  },

  initTrendChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [
          { label: 'Sessions', data: data.map(d => d.sessions), backgroundColor: '#1565C0', borderRadius: 3 },
          { label: 'Views',    data: data.map(d => d.views),    backgroundColor: '#8BC34A', borderRadius: 3 }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
      }
    });
  },

  setupSearch() {
    const input = document.getElementById('coach-search');
    if (!input) return;
    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const tbody = document.getElementById('coach-tbody');
      if (!tbody) return;
      Array.from(tbody.querySelectorAll('tr')).forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
};

window.CoachingPage = CoachingPage;
