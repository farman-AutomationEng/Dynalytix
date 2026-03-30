/**
 * homepage.js — Homepage Dashboard
 * Designed to match GoAnalytics v3.9.7 layout exactly.
 *
 * Score card : Company name + gradient gauge (green→yellow→orange→red)
 * Trend chart: Bars colored by score tier
 * GPS/Camera : Clean SVG-icon KPI cards, side by side
 */

const HomepagePage = {

  async render(container, { api, fromDate, toDate, period, groupIds, settings }) {

    const S    = settings || window.DynSettings || {};
    const show = {
      scoreTrend:       S.scoreTrend       !== false,
      gpsOffline:       S.gpsOffline       !== false,
      cameraOffline:    S.cameraOffline    !== false,
      fleetPerformance: S.fleetPerformance !== false,
      insights:         S.insights         !== false,
      coachingSnapshot: S.coachingSnapshot !== false,
      eventPerformance: S.eventPerformance !== false,
    };

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
      api.getAnnotationLogs(fromDate, toDate, groupIds),
    ]);

    const periodMs   = toDate - fromDate;
    const prevTo     = new Date(fromDate);
    const prevFrom   = new Date(fromDate.getTime() - periodMs);
    const prevEvents = await api.getExceptionEvents(prevFrom, prevTo, groupIds);

    const currentScore = Utils.calculateScore(events, ruleMap);
    const prevScore    = Utils.calculateScore(prevEvents, ruleMap);
    const trend        = Utils.calcTrend(currentScore, prevScore);

    const driverEventMap = api.groupEventsByDriver(events);
    const driverScores   = drivers
      .map(d => Utils.calculateScore(driverEventMap[d.id] || [], ruleMap))
      .filter(s => s > 0).sort((a, b) => a - b);
    const medianScore = driverScores.length
      ? driverScores[Math.floor(driverScores.length / 2)] : 0;

    const gpsOfflineCount = api.countOfflineDevices(deviceStatusList, 5);
    const totalDevices    = deviceStatusList.length;
    const cameraDevices   = devices.filter(d =>
      (d.deviceType || '').toLowerCase().includes('surfsight') ||
      (d.name || '').toLowerCase().includes('surfsight') ||
      (d.name || '').toLowerCase().includes('cam') ||
      (d.name || '').toLowerCase().includes('go focus')
    );
    const cameraTotal        = cameraDevices.length || totalDevices;
    const cameraOfflineCount = deviceStatusList.filter(ds =>
      cameraDevices.some(cd => cd.id === ds.device?.id) && !ds.isDeviceCommunicating
    ).length;

    const eventCounts = {}, prevEventCounts = {};
    events.forEach(e     => { const n = ruleMap[e.rule?.id] || 'Unknown'; eventCounts[n]     = (eventCounts[n]     || 0) + 1; });
    prevEvents.forEach(e => { const n = ruleMap[e.rule?.id] || 'Unknown'; prevEventCounts[n] = (prevEventCounts[n] || 0) + 1; });

    const topEvents = Object.entries(eventCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, trend: Utils.calcTrend(count, prevEventCounts[name] || 0) }));

    const periods6    = Utils.getLast6Periods();
    const trendScores = await Promise.all(
      periods6.map(async p => {
        const pEvts = await api.getExceptionEvents(p.fromDate, p.toDate, groupIds);
        return { label: p.label, score: Utils.calculateScore(pEvts, ruleMap) };
      })
    );

    const coachingByPeriod = periods6.map(p => {
      const logs = coachingLogs.filter(l => {
        const d = new Date(l.dateTime || l.logTime || l.date);
        return d >= p.fromDate && d <= p.toDate;
      });
      return { label: p.label, events: logs.length, views: logs.filter(l => l.viewed).length };
    });

    const groups         = await api.getGroups();
    const deviceEventMap = api.groupEventsByDevice(events);

    const groupRows = groups.slice(0, 10).map(g => {
      const gDevices = devices.filter(d => (d.groups || []).some(dg => dg.id === g.id));
      const gEvents  = [];
      gDevices.forEach(d => (deviceEventMap[d.id] || []).forEach(e => gEvents.push(e)));
      const score  = gEvents.length ? Utils.calculateScore(gEvents, ruleMap) : null;
      const gCoach = coachingLogs.filter(l => gDevices.some(d => d.id === l.device?.id));
      return { name: g.name, score, trend: 0, coaching: gCoach.length, views: gCoach.filter(l => l.viewed).length };
    });

    const driverRows = drivers.map(d => {
      const dEvts  = driverEventMap[d.id] || [];
      const score  = dEvts.length ? Utils.calculateScore(dEvts, ruleMap) : null;
      const dCoach = coachingLogs.filter(l => l.driver?.id === d.id || l.user?.id === d.id);
      return {
        name: ((d.firstName || '') + ' ' + (d.lastName || d.name || '')).trim(),
        score, trend: 0,
        coaching: dCoach.length,
        views: dCoach.filter(l => l.viewed).length,
      };
    });

    container.innerHTML = this.buildHTML({
      currentScore, prevScore, trend, medianScore,
      gpsOfflineCount, totalDevices,
      cameraOfflineCount, cameraTotal,
      topEvents, coachingByPeriod, groupRows, driverRows,
      trendScores,
    });

    this.initGaugeChart('score-gauge-canvas', currentScore);
    this.initTrendChart('trend-chart-canvas', trendScores);
    this.initCoachingChart('coaching-chart-canvas', coachingByPeriod);
    this.setupTableTabs();
    this.applyWidgetVisibility(S);
  },

  buildHTML(data) {
    const {
      currentScore, trend, medianScore,
      gpsOfflineCount, totalDevices,
      cameraOfflineCount, cameraTotal,
      topEvents, coachingByPeriod, groupRows, driverRows,
    } = data;

    const tier       = Utils.getScoreTier(currentScore);
    const scoreColor = tier ? tier.color : '#4CAF50';
    const scoreCat   = tier ? tier.label : 'Very Low';
    const trendPos   = trend > 0;
    const trendColor = trendPos ? '#F44336' : '#4CAF50';
    const trendArrow = trendPos ? '↑' : '↓';
    const trendSign  = trendPos ? '+' : '';

    const medTier    = Utils.getScoreTier(medianScore);
    const medColor   = medTier ? medTier.color : '#4CAF50';

    return `
    <div class="homepage-grid">

      <!-- SCORE GAUGE -->
      <div class="card ga-score-card">
        <div class="card-header">
          <span class="card-title">Dynasty Communications Score</span>
        </div>
        <div class="ga-score-meta">
          <div class="ga-meta-row">
            <span class="ga-meta-label">&#9654; Current Score</span>
            <span class="ga-meta-num">${Utils.formatNumber(currentScore)}</span>
            <span class="ga-meta-trend" style="color:${trendColor}">${trendSign}${Math.abs(trend)}% ${trendArrow}</span>
          </div>
          <div class="ga-meta-row">
            <span class="ga-meta-label">&#9642; Company Median Score</span>
            <span class="ga-meta-num">${Utils.formatNumber(medianScore)}</span>
          </div>
        </div>
        <canvas id="score-gauge-canvas"></canvas>
        <div class="ga-gauge-num" style="color:${scoreColor}">${Utils.formatNumber(currentScore)}</div>
        <div class="ga-gauge-cat" style="color:${scoreColor};border-color:${scoreColor}">${scoreCat}</div>
        <div class="ga-gauge-pct" style="color:${trendColor}">${trendSign}${Math.abs(trend)}% ${trendArrow}</div>
      </div>

      <!-- SCORE TREND -->
      <div class="card ga-trend-card" id="widget-score-trend">
        <div class="card-header">
          <div>
            <div class="card-title">Dynasty Communications Score Trend</div>
            <div class="card-subtitle">Throughout the last 6 periods</div>
          </div>
        </div>
        <canvas id="trend-chart-canvas" height="155"></canvas>
      </div>

      <!-- GPS OFFLINE -->
      <div class="card ga-kpi-card" id="widget-gps-offline">
        <div class="ga-kpi-top">
          <span class="ga-kpi-title">GPS Offline</span>
          <span class="ga-kpi-sub">5 days or more</span>
        </div>
        <div class="ga-kpi-body">
          <svg class="ga-kpi-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2C8.686 2 6 4.686 6 8c0 5 6 13 6 13s6-8 6-13c0-3.314-2.686-6-6-6z"/>
            <circle cx="12" cy="8" r="2.5"/>
          </svg>
          <div class="ga-kpi-num ${gpsOfflineCount > 0 ? 'ga-kpi-alert' : ''}">${gpsOfflineCount}/${totalDevices}</div>
        </div>
      </div>

      <!-- CAMERAS OFFLINE -->
      <div class="card ga-kpi-card" id="widget-cam-offline">
        <div class="ga-kpi-top">
          <span class="ga-kpi-title">Cameras Offline</span>
          <span class="ga-kpi-sub">5 days or more</span>
        </div>
        <div class="ga-kpi-body">
          <svg class="ga-kpi-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 7l-7 5 7 5V7z"/>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>
          <div class="ga-kpi-num ${cameraOfflineCount > 0 ? 'ga-kpi-alert' : ''}">${cameraOfflineCount}/${cameraTotal}</div>
        </div>
      </div>

      <!-- FLEET PERFORMANCE -->
      <div class="card ga-perf-card" id="widget-fleet-perf">
        <div class="card-header">
          <div>
            <div class="card-title">Dynasty Communications Performance</div>
            <div class="card-subtitle">Total unsafe driving points</div>
          </div>
        </div>
        <div class="table-tabs">
          <button class="tab-btn active" data-tab="groups">Groups (${groupRows.length})</button>
          <button class="tab-btn" data-tab="drivers">Drivers (${driverRows.length})</button>
        </div>
        <div class="tab-content active" id="tab-groups">${this.buildPerfTable(groupRows, 'GROUP')}</div>
        <div class="tab-content" id="tab-drivers">${this.buildPerfTable(driverRows, 'DRIVER')}</div>
      </div>

      <!-- INSIGHTS -->
      <div class="card ga-insights-card" id="widget-insights">
        <div class="card-header">
          <div>
            <div class="card-title">Insights</div>
            <div class="card-subtitle">Rule-based analysis</div>
          </div>
        </div>
        <div class="ga-insights-body">${this.generateInsight(driverRows, topEvents)}</div>
      </div>

      <!-- COACHING SNAPSHOT -->
      <div class="card ga-coaching-card" id="widget-coaching-snap">
        <div class="card-header">
          <div>
            <div class="card-title">Coaching Snapshot</div>
            <div class="card-subtitle">Coaching activity throughout the last 6 periods</div>
          </div>
        </div>
        <canvas id="coaching-chart-canvas" height="130"></canvas>
        <div class="chart-legend" style="margin-top:6px">
          <span class="legend-item"><span class="legend-dot" style="background:#4CAF50"></span>Views</span>
          <span class="legend-item"><span class="legend-dot" style="background:#1565C0"></span>Coaching Events</span>
        </div>
      </div>

      <!-- EVENT PERFORMANCE -->
      <div class="card ga-events-card" id="widget-event-perf">
        <div class="card-header">
          <div>
            <div class="card-title">Event Performance</div>
            <div class="card-subtitle">Exception events compared to last period</div>
          </div>
        </div>
        <table class="data-table">
          <thead>
            <tr><th>EVENTS</th><th>AMOUNT</th><th>TREND</th></tr>
          </thead>
          <tbody>
            ${topEvents.map(evt => {
              const max    = topEvents[0]?.count || 1;
              const barW   = Math.min(100, Math.round((evt.count / max) * 100));
              const barCol = evt.count > 100 ? '#F44336'
                           : evt.count > 50  ? '#FF9800'
                           : evt.count > 20  ? '#FFC107'
                           : '#4CAF50';
              return `<tr>
                <td>${evt.name}</td>
                <td>
                  <div class="ga-event-bar-wrap">
                    <div class="ga-event-bar" style="width:${barW}%;background:${barCol}"></div>
                    <span class="ga-event-count">${evt.count}</span>
                  </div>
                </td>
                <td>${Utils.trendBadge(evt.trend)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

    </div>`;
  },

  buildPerfTable(rows, label) {
    return `
      <table class="data-table">
        <thead>
          <tr>
            <th>${label}</th><th>SCORE</th><th>TREND</th><th>COACHING EVENTS</th><th>VIEWS</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="link-text">${r.name || '—'}</td>
              <td>${Utils.scoreBadge(r.score)}</td>
              <td>${r.score !== null ? Utils.trendBadge(r.trend) : '—'}</td>
              <td>${r.coaching || 0}</td>
              <td>${r.views || 0}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  },

  generateInsight(driverRows, topEvents) {
    const withScores = driverRows.filter(d => d.score !== null);
    const worst  = [...withScores].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    const topEvt = topEvents[0];
    let html = '';
    if (worst) {
      const t = Utils.getScoreTier(worst.score);
      html += `<p><span style="color:${t ? t.color : '#F44336'}">&#9679;</span> Driver <strong>${worst.name.trim()}</strong> has the highest score: <strong>${Utils.formatNumber(worst.score)}</strong> points.</p>`;
    }
    if (topEvt) {
      html += `<p>Most common event: <strong>${topEvt.name}</strong> — ${topEvt.count} occurrences this period.</p>`;
    }
    return html || '<p>No notable insights for this period.</p>';
  },

  // ============================================================
  // GAUGE — gradient arc green→yellow→orange→red, fits in card
  // ============================================================
  initGaugeChart(canvasId, score) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const isDark = document.getElementById('dyn-app')?.classList.contains('dyn-dark');
    const card   = canvas.closest('.ga-score-card');
    const W      = card ? card.clientWidth - 32 : 220;

    canvas.width  = W;
    canvas.height = Math.round(W * 0.55);

    const ctx = canvas.getContext('2d');
    const cx  = W / 2;
    const cy  = canvas.height - 12;
    const r   = Math.round(W * 0.36);
    const lw  = Math.round(W * 0.07);

    const maxScore = 10000;
    const pct      = Math.min(score / maxScore, 1);

    ctx.clearRect(0, 0, W, canvas.height);

    // Track (background)
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = isDark ? '#2D3046' : '#EEEEEE';
    ctx.lineWidth   = lw;
    ctx.lineCap     = 'butt';
    ctx.stroke();

    // Colored segments — green → yellow → orange → red
    const segs = [
      [0,    0.10, '#4CAF50'],
      [0.10, 0.20, '#8BC34A'],
      [0.20, 0.40, '#FFEB3B'],
      [0.40, 0.55, '#FF9800'],
      [0.55, 0.70, '#FF5722'],
      [0.70, 1.00, '#F44336'],
    ];
    segs.forEach(([from, to, col]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI + from * Math.PI, Math.PI + to * Math.PI);
      ctx.strokeStyle = col;
      ctx.lineWidth   = lw;
      ctx.lineCap     = 'butt';
      ctx.stroke();
    });

    // Grey overlay for unfilled portion
    if (pct < 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI + pct * Math.PI, 2 * Math.PI);
      ctx.strokeStyle = isDark ? '#2D3046' : '#EEEEEE';
      ctx.lineWidth   = lw;
      ctx.lineCap     = 'butt';
      ctx.stroke();
    }

    // Needle
    const na  = Math.PI + pct * Math.PI;
    const nl  = r - lw / 2 - 2;
    const col = isDark ? '#E8EAF0' : '#424242';

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(na);
    ctx.beginPath();
    ctx.moveTo(nl, 0);
    ctx.lineTo(-8, -3);
    ctx.lineTo(-8, 3);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();

    // Hub dot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
    ctx.fillStyle = col;
    ctx.fill();

    // Scale labels
    const fs = Math.max(10, Math.round(W * 0.036));
    ctx.fillStyle = isDark ? '#8B90A8' : '#9E9E9E';
    ctx.font      = `${fs}px Segoe UI, Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('0', cx - r - lw / 2 - 2, cy + 14);
    ctx.textAlign = 'center';
    ctx.fillText('5000', cx, cy - r - lw / 2 - 4);
    ctx.textAlign = 'right';
    ctx.fillText('10000+', cx + r + lw / 2 + 2, cy + 14);
  },

  // ============================================================
  // TREND CHART — bars colored by score tier
  // ============================================================
  initTrendChart(canvasId, trendScores) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const isDark    = document.getElementById('dyn-app')?.classList.contains('dyn-dark');
    const gridColor = isDark ? '#2D3046' : '#F0F0F0';
    const tickColor = isDark ? '#8B90A8' : '#666666';
    const scores    = trendScores.map(p => p.score);

    const barColor = v => {
      if (v > 5000)  return '#F44336';
      if (v >= 2000) return '#FF9800';
      if (v >= 1000) return '#FFEB3B';
      return '#4CAF50';
    };

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels:   trendScores.map(p => p.label),
        datasets: [{
          data:            scores,
          backgroundColor: scores.map(v => barColor(v)),
          borderRadius:    3,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, maxTicksLimit: 6 } },
          x: { grid: { display: false }, ticks: { color: tickColor } },
        },
      },
    });
  },

  // ============================================================
  // COACHING CHART
  // ============================================================
  initCoachingChart(canvasId, coachingByPeriod) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const isDark    = document.getElementById('dyn-app')?.classList.contains('dyn-dark');
    const tickColor = isDark ? '#8B90A8' : '#666666';

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels:   coachingByPeriod.map(p => p.label),
        datasets: [
          { label: 'Views',           data: coachingByPeriod.map(p => p.views),  backgroundColor: '#4CAF50', borderRadius: 3 },
          { label: 'Coaching Events', data: coachingByPeriod.map(p => p.events), backgroundColor: '#1565C0', borderRadius: 3 },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { color: tickColor, maxTicksLimit: 5 } },
          x: { grid: { display: false }, ticks: { color: tickColor } },
        },
      },
    });
  },

  setupTableTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab    = btn.getAttribute('data-tab');
        const parent = btn.closest('.card');
        if (!parent) return;
        parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        parent.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        const tc = parent.querySelector('#tab-' + tab);
        if (tc) tc.classList.add('active');
      });
    });
  },

  applyWidgetVisibility(s) {
    [
      ['scoreTrend',       '#widget-score-trend'],
      ['gpsOffline',       '#widget-gps-offline'],
      ['cameraOffline',    '#widget-cam-offline'],
      ['fleetPerformance', '#widget-fleet-perf'],
      ['insights',         '#widget-insights'],
      ['coachingSnapshot', '#widget-coaching-snap'],
      ['eventPerformance', '#widget-event-perf'],
    ].forEach(([key, sel]) => {
      const el = document.querySelector(sel);
      if (el) el.style.display = s[key] !== false ? '' : 'none';
    });
  },
};

window.HomepagePage = HomepagePage;
