/**
 * homepage.js — Homepage Dashboard
 *
 * Widgets:
 * 1. Org Score Gauge (semicircle canvas)
 * 2. Score Trend Bar Chart (last 6 periods — REAL API DATA)
 * 3. GPS Offline KPI
 * 4. Cameras Offline KPI
 * 5. Fleet Performance Table (Groups / Drivers tabs)
 * 6. AI Insights (rule-based)
 * 7. Coaching Snapshot Chart
 * 8. Event Performance Table
 */

const HomepagePage = {

  async render(container, { api, fromDate, toDate, period, groupIds }) {

    // ---- PARALLEL FETCH ----
    const [
      events, ruleMap, deviceStatusList,
      devices, drivers, trips, coachingLogs
    ] = await Promise.all([
      api.getExceptionEvents(fromDate, toDate, groupIds),
      api.getRuleMap(),
      api.getDeviceStatusInfo(groupIds),
      api.getDevices(groupIds),
      api.getDrivers(groupIds),
      api.getTrips(fromDate, toDate, groupIds),
      api.getAnnotationLogs(fromDate, toDate, groupIds)
    ]);

    // ---- PREVIOUS PERIOD ----
    const periodMs = toDate - fromDate;
    const prevTo   = new Date(fromDate);
    const prevFrom = new Date(fromDate.getTime() - periodMs);
    const prevEvents = await api.getExceptionEvents(prevFrom, prevTo, groupIds);

    // ---- SCORES ----
    const currentScore = Utils.calculateScore(events, ruleMap);
    const prevScore    = Utils.calculateScore(prevEvents, ruleMap);
    const trend        = Utils.calcTrend(currentScore, prevScore);

    const driverEventMap = api.groupEventsByDriver(events);
    const driverScores   = drivers
      .map(d => Utils.calculateScore(driverEventMap[d.id] || [], ruleMap))
      .filter(s => s > 0).sort((a, b) => a - b);
    const medianScore = driverScores.length
      ? driverScores[Math.floor(driverScores.length / 2)]
      : 0;

    // ---- GPS / CAMERA OFFLINE ----
    const gpsOfflineCount  = api.countOfflineDevices(deviceStatusList, 5);
    const totalDevices     = deviceStatusList.length;
    const cameraDevices    = devices.filter(d =>
      (d.deviceType || '').toLowerCase().includes('surfsight') ||
      (d.name || '').toLowerCase().includes('surfsight') ||
      (d.name || '').toLowerCase().includes('cam')
    );
    const cameraOfflineCount = deviceStatusList.filter(ds => {
      return cameraDevices.some(cd => cd.id === ds.device?.id) && !ds.isDeviceCommunicating;
    }).length;

    // ---- TOP EVENTS ----
    const eventCounts     = {};
    const prevEventCounts = {};
    events.forEach(e     => { const n = ruleMap[e.rule?.id]||'Unknown'; eventCounts[n]     = (eventCounts[n]||0)+1; });
    prevEvents.forEach(e => { const n = ruleMap[e.rule?.id]||'Unknown'; prevEventCounts[n] = (prevEventCounts[n]||0)+1; });

    const topEvents = Object.entries(eventCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, count]) => ({
        name, count,
        trend: Utils.calcTrend(count, prevEventCounts[name] || 0)
      }));

    // ---- TREND CHART — REAL API DATA (last 6 periods) ----
    const periods6     = Utils.getLast6Periods();
    const trendScores  = await Promise.all(
      periods6.map(async (p) => {
        const pEvents = await api.getExceptionEvents(p.fromDate, p.toDate, groupIds);
        return { label: p.label, score: Utils.calculateScore(pEvents, ruleMap) };
      })
    );

    // ---- COACHING SNAPSHOT ----
    const coachingByPeriod = periods6.map(p => {
      const periodLogs = coachingLogs.filter(log => {
        const d = new Date(log.dateTime || log.logTime || log.date);
        return d >= p.fromDate && d <= p.toDate;
      });
      return {
        label:  p.label,
        events: periodLogs.length,
        views:  periodLogs.filter(l => l.viewed).length
      };
    });

    // ---- GROUP PERFORMANCE TABLE ----
    const groups = await api.getGroups();
    const deviceEventMap = api.groupEventsByDevice(events);
    const groupRows = groups.slice(0, 10).map(g => {
      const gDevices = devices.filter(d => (d.groups||[]).some(dg => dg.id === g.id));
      const gEvents  = [];
      gDevices.forEach(d => (deviceEventMap[d.id]||[]).forEach(e => gEvents.push(e)));
      const score    = gEvents.length ? Utils.calculateScore(gEvents, ruleMap) : null;
      const gCoach   = coachingLogs.filter(l => gDevices.some(d => d.id === l.device?.id));
      return { name: g.name, score, trend: 0, coaching: gCoach.length, views: gCoach.filter(l=>l.viewed).length };
    });

    // ---- DRIVER PERFORMANCE TABLE ----
    const driverRows = drivers.map(d => {
      const dEvts  = driverEventMap[d.id] || [];
      const score  = dEvts.length ? Utils.calculateScore(dEvts, ruleMap) : null;
      const dCoach = coachingLogs.filter(l => l.driver?.id === d.id || l.user?.id === d.id);
      return {
        name:     ((d.firstName||'') + ' ' + (d.lastName||d.name||'')).trim(),
        score,
        trend:    0,
        coaching: dCoach.length,
        views:    dCoach.filter(l=>l.viewed).length
      };
    });

    // ---- RENDER ----
    container.innerHTML = this.buildHTML({
      currentScore, prevScore, trend, medianScore,
      gpsOfflineCount, totalDevices,
      cameraOfflineCount, cameraTotal: cameraDevices.length || totalDevices,
      topEvents, coachingByPeriod, groupRows, driverRows, trendScores
    });

    this.initGaugeChart('score-gauge-canvas', currentScore);
    this.initTrendChart('trend-chart-canvas', trendScores);
    this.initCoachingChart('coaching-chart-canvas', coachingByPeriod);
    this.setupTableTabs();
  },

  // ============================================================
  // HTML BUILDER
  // ============================================================

  buildHTML(data) {
    const {
      currentScore, trend, medianScore,
      gpsOfflineCount, totalDevices,
      cameraOfflineCount, cameraTotal,
      topEvents, coachingByPeriod, groupRows, driverRows
    } = data;

    const scoreColor    = Utils.getScoreColor(currentScore);
    const scoreCategory = Utils.getScoreCategory(currentScore);

    return `
    <div class="homepage-grid">

      <!-- SCORE GAUGE -->
      <div class="card score-card">
        <div class="card-header">
          <span class="card-title">Fleet Score</span>
          <button class="card-info-btn" title="Lower score = safer fleet">ℹ️</button>
        </div>
        <div class="score-summary">
          <div>
            <span class="score-label">▶ Current Score</span>
            <span class="score-value">${Utils.formatNumber(currentScore)}</span>
            ${Utils.trendBadge(trend)}
          </div>
          <div>
            <span class="score-label">▪ Median Score</span>
            <span class="score-value">${Utils.formatNumber(medianScore)}</span>
          </div>
        </div>
        <canvas id="score-gauge-canvas" width="220" height="130"></canvas>
        <div class="score-number" style="color:${scoreColor};font-size:28px;margin-top:-12px">${Utils.formatNumber(currentScore)}</div>
        <div class="score-category" style="border-color:${scoreColor};color:${scoreColor}">${scoreCategory}</div>
        <div class="score-trend-label">${Math.abs(trend)}% ${trend > 0 ? '↑ vs last period' : '↓ vs last period'}</div>
      </div>

      <!-- SCORE TREND CHART -->
      <div class="card trend-card">
        <div class="card-header">
          <span class="card-title">Score Trend</span>
          <span class="card-subtitle">Last 6 weekly periods</span>
        </div>
        <canvas id="trend-chart-canvas" height="200"></canvas>
      </div>

      <!-- GPS OFFLINE -->
      <div class="card kpi-card">
        <div class="card-header">
          <span class="card-title">GPS Offline</span>
          <span class="card-subtitle">5+ days</span>
        </div>
        <div class="kpi-icon">📡</div>
        <div class="kpi-value ${gpsOfflineCount > 0 ? 'kpi-alert' : ''}">${gpsOfflineCount}/${totalDevices}</div>
      </div>

      <!-- CAMERAS OFFLINE -->
      <div class="card kpi-card">
        <div class="card-header">
          <span class="card-title">Cameras Offline</span>
          <span class="card-subtitle">5+ days</span>
        </div>
        <div class="kpi-icon">📷</div>
        <div class="kpi-value ${cameraOfflineCount > 0 ? 'kpi-alert' : ''}">${cameraOfflineCount}/${cameraTotal}</div>
      </div>

      <!-- PERFORMANCE TABLE -->
      <div class="card performance-table-card">
        <div class="card-header">
          <span class="card-title">Fleet Performance</span>
          <span class="card-subtitle">Total unsafe driving points</span>
        </div>
        <div class="table-tabs">
          <button class="tab-btn active" data-tab="groups">Groups (${groupRows.length})</button>
          <button class="tab-btn" data-tab="drivers">Drivers (${driverRows.length})</button>
        </div>
        <div class="tab-content active" id="tab-groups">
          ${this.buildPerformanceTable(groupRows, 'GROUP')}
        </div>
        <div class="tab-content" id="tab-drivers">
          ${this.buildPerformanceTable(driverRows, 'DRIVER')}
        </div>
      </div>

      <!-- INSIGHTS -->
      <div class="card insights-card">
        <div class="card-header">
          <span class="card-title">✨ Insights</span>
          <span class="card-subtitle">Rule-based analysis</span>
        </div>
        <div class="insights-text">
          ${this.generateInsight(driverRows, topEvents)}
        </div>
      </div>

      <!-- COACHING SNAPSHOT -->
      <div class="card coaching-snapshot-card">
        <div class="card-header">
          <span class="card-title">Coaching Snapshot</span>
          <span class="card-subtitle">Last 6 periods</span>
        </div>
        <canvas id="coaching-chart-canvas" height="150"></canvas>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot blue"></span>Views</span>
          <span class="legend-item"><span class="legend-dot green"></span>Sessions</span>
        </div>
      </div>

      <!-- EVENT PERFORMANCE -->
      <div class="card event-performance-card">
        <div class="card-header">
          <span class="card-title">Event Performance</span>
          <span class="card-subtitle">Top exception events vs last period</span>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>EVENT</th>
              <th>COUNT</th>
              <th>TREND</th>
            </tr>
          </thead>
          <tbody>
            ${topEvents.map(evt => `
              <tr>
                <td>${evt.name}</td>
                <td>
                  <div class="event-bar-wrap">
                    <div class="event-bar"
                      style="width:${Math.min(100, evt.count)}%;background:${evt.count > 50 ? '#FF6F00' : '#1565C0'}">
                    </div>
                    <span>${evt.count}</span>
                  </div>
                </td>
                <td>${Utils.trendBadge(evt.trend)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

    </div>
    `;
  },

  buildPerformanceTable(rows, labelType) {
    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>${labelType}</th>
            <th>SCORE</th>
            <th>TREND</th>
            <th>COACHING</th>
            <th>VIEWS</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td class="link-text">${row.name || '—'}</td>
              <td>${Utils.scoreBadge(row.score)}</td>
              <td>${row.score !== null ? Utils.trendBadge(row.trend) : '—'}</td>
              <td>${row.coaching || 0}</td>
              <td>${row.views    || 0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  },

  generateInsight(driverRows, topEvents) {
    const withScores = driverRows.filter(d => d.score !== null);
    const worst  = [...withScores].sort((a, b) => (b.score||0) - (a.score||0))[0];
    const topEvt = topEvents[0];
    const highRisk = withScores.filter(d => Utils.getScoreCategory(d.score) === 'High').length;
    let insight = '';

    if (highRisk > 0) {
      insight += `<p>⚠️ <strong>${highRisk} driver${highRisk > 1 ? 's' : ''}</strong> are in the high-risk category (score ≥ 5000).</p>`;
    }
    if (worst) {
      insight += `<p>🔴 Driver <strong>${worst.name.trim()}</strong> has the highest score: <strong>${Utils.formatNumber(worst.score)}</strong> points.</p>`;
    }
    if (topEvt) {
      insight += `<p>📊 Most common event: <strong>${topEvt.name}</strong> — ${topEvt.count} occurrences this period.</p>`;
    }
    return insight || '<p>✅ No notable safety issues found in this period.</p>';
  },

  // ============================================================
  // CHARTS
  // ============================================================

  initGaugeChart(canvasId, score) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx     = canvas.getContext('2d');
    const color   = Utils.getScoreColor(score);
    const cx      = canvas.width / 2;
    const cy      = canvas.height - 20;
    const r       = 100;
    const maxScore = 10000;
    const pct      = Math.min(score / maxScore, 1);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth   = 20;
    ctx.stroke();

    // Colored arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, Math.PI + pct * Math.PI);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 20;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Needle
    const needleAngle = Math.PI + pct * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 66 * Math.cos(needleAngle), cy + 66 * Math.sin(needleAngle));
    ctx.strokeStyle = '#333';
    ctx.lineWidth   = 3;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#333';
    ctx.fill();

    // Labels
    ctx.fillStyle  = '#9E9E9E';
    ctx.font       = '11px Segoe UI';
    ctx.fillText('0',       cx - r - 8, cy + 14);
    ctx.fillText('5000',    cx - 18,    cy - r - 8);
    ctx.fillText('10000+',  cx + r - 28, cy + 14);
  },

  initTrendChart(canvasId, trendScores) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const scores = trendScores.map(p => p.score);
    const last   = scores.length - 1;

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels:   trendScores.map(p => p.label),
        datasets: [{
          data:            scores,
          backgroundColor: scores.map((v, i) =>
            i === last ? '#FF6F00' : '#FFAB66'
          ),
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#F0F0F0' } },
          x: { grid: { display: false } }
        }
      }
    });
  },

  initCoachingChart(canvasId, coachingByPeriod) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: coachingByPeriod.map(p => p.label),
        datasets: [
          {
            label:           'Views',
            data:            coachingByPeriod.map(p => p.views),
            backgroundColor: '#1565C0',
            borderRadius:    3
          },
          {
            label:           'Sessions',
            data:            coachingByPeriod.map(p => p.events),
            backgroundColor: '#8BC34A',
            borderRadius:    3
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true },
          x: { grid: { display: false } }
        }
      }
    });
  },

  setupTableTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        const tc = document.getElementById('tab-' + tab);
        if (tc) tc.classList.add('active');
      });
    });
  }
};

window.HomepagePage = HomepagePage;
