/**
 * leaderboard.js — Leaderboard Page
 *
 * Widgets:
 * 1. Score Breakdown Donut Chart (High/Medium/Low drivers)
 * 2. Most Improved Driver Card
 * 3. Lowest Trending Driver Card
 * 4. Top 3 Events Table
 * 5. Top 5 Performers Table
 * 6. Lowest Performance Drivers Table
 */

const LeaderboardPage = {

  async render(container, { api, fromDate, toDate, period, groupIds }) {

    // ---- FETCH DATA ----
    const [events, prevEvents, ruleMap, drivers, devices, trips] = await Promise.all([
      api.getExceptionEvents(fromDate, toDate, groupIds),
      api.getExceptionEvents(
        new Date(fromDate.getTime() - (toDate - fromDate)),
        new Date(fromDate),
        groupIds
      ),
      api.getRuleMap(),
      api.getDrivers(groupIds),
      api.getDevices(groupIds),
      api.getTrips(fromDate, toDate, groupIds)
    ]);

    // ---- DRIVER SCORES ----
    const driverEventMap = api.groupEventsByDriver(events);
    const prevDriverEventMap = api.groupEventsByDriver(prevEvents);
    const tripAgg = api.aggregateTrips(trips);

    // Device -> Driver mapping
    const deviceDriverMap = {};
    events.forEach(e => {
      if (e.device?.id && e.driver?.id) deviceDriverMap[e.device.id] = e.driver.id;
    });

    const driverData = drivers.map(d => {
      const dEvts = driverEventMap[d.id] || [];
      const prevEvts = prevDriverEventMap[d.id] || [];
      const score = Utils.calculateScore(dEvts, ruleMap);
      const prevScore = Utils.calculateScore(prevEvts, ruleMap);
      const trend = Utils.calcTrend(score, prevScore);

      // Find vehicle
      const vehicle = devices.find(dev => deviceDriverMap[dev.id] === d.id);
      const driverTrips = trips.filter(t => t.driver?.id === d.id);
      const miles = driverTrips.reduce((sum, t) => sum + Utils.metersToMiles(t.distance || 0), 0);

      return {
        id: d.id,
        name: ((d.firstName || '') + ' ' + (d.lastName || d.name || '')).trim(),
        vehicleName: vehicle?.name || '-',
        score,
        prevScore,
        trend,
        miles,
        category: Utils.getScoreCategory(score)
      };
    }).filter(d => d.miles > 0 || d.score > 0);

    // ---- SCORE BREAKDOWN ----
    const highCount   = driverData.filter(d => d.category === 'High').length;
    const mediumCount = driverData.filter(d => d.category === 'Medium').length;
    const lowCount    = driverData.filter(d => d.category === 'Low').length;
    const totalDrivers = driverData.length;

    // ---- MOST IMPROVED / LOWEST TRENDING ----
    const sortedByTrend = [...driverData].sort((a, b) => a.trend - b.trend);
    const mostImproved  = sortedByTrend[0];    // Biggest decrease (best)
    const lowestTrend   = sortedByTrend[sortedByTrend.length - 1]; // Biggest increase (worst)

    // ---- TOP 3 EVENTS ----
    const eventCounts = {};
    const prevEventCounts = {};
    events.forEach(e => { const n = ruleMap[e.rule?.id] || 'Unknown'; eventCounts[n] = (eventCounts[n]||0)+1; });
    prevEvents.forEach(e => { const n = ruleMap[e.rule?.id] || 'Unknown'; prevEventCounts[n] = (prevEventCounts[n]||0)+1; });

    const top3Events = Object.entries(eventCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([name, count]) => ({
        name, count,
        trend: Utils.calcTrend(count, prevEventCounts[name] || 0)
      }));

    // ---- TOP 5 PERFORMERS (lowest score = best) ----
    const top5 = [...driverData].sort((a, b) => a.score - b.score).slice(0, 5);

    // ---- LOWEST PERFORMERS ----
    const bottom5 = [...driverData].sort((a, b) => b.score - a.score).slice(0, 5);

    // ---- RENDER ----
    container.innerHTML = this.buildHTML({
      highCount, mediumCount, lowCount, totalDrivers,
      mostImproved, lowestTrend,
      top3Events, top5, bottom5
    });

    // Charts
    this.initDonutChart('donut-chart-canvas', { highCount, mediumCount, lowCount });
    this.initTopEventsChart('top-events-chart-canvas', top3Events);
  },

  buildHTML(data) {
    const { highCount, mediumCount, lowCount, totalDrivers, mostImproved, lowestTrend, top3Events, top5, bottom5 } = data;
    const highPct   = totalDrivers > 0 ? ((highCount / totalDrivers) * 100).toFixed(2) : 0;
    const medPct    = totalDrivers > 0 ? ((mediumCount / totalDrivers) * 100).toFixed(2) : 0;
    const lowPct    = totalDrivers > 0 ? ((lowCount / totalDrivers) * 100).toFixed(2) : 0;

    return `
    <div class="leaderboard-grid">

      <!-- DONUT CHART -->
      <div class="card donut-card">
        <div class="card-header"><span class="card-title">Score Breakdown</span>
          <span class="card-subtitle">Count of drivers in each category</span></div>
        <div class="donut-wrapper">
          <canvas id="donut-chart-canvas" width="260" height="260"></canvas>
          <div class="donut-legend">
            <div class="donut-legend-item"><span class="dot red"></span>High: ${highPct}%</div>
            <div class="donut-legend-item"><span class="dot orange"></span>Medium: ${medPct}%</div>
            <div class="donut-legend-item"><span class="dot green"></span>Low: ${lowPct}%</div>
          </div>
          <div class="donut-center-label">Total Drivers<br><strong>${totalDrivers}</strong></div>
        </div>
      </div>

      <!-- TOP 5 PERFORMERS -->
      <div class="card top5-card">
        <div class="card-header"><span class="card-title">Top 5 Performers</span></div>
        <table class="data-table">
          <thead>
            <tr><th>DRIVER ↕</th><th>VEHICLE ↕</th><th>SCORE ↓</th><th>MILES ↕</th></tr>
          </thead>
          <tbody>
            ${top5.map(d => `
              <tr>
                <td class="link-text">${d.name}</td>
                <td class="link-text">${d.vehicleName}</td>
                <td><span class="score-badge" style="background:${Utils.getScoreColor(d.score)}22;color:${Utils.getScoreColor(d.score)}">${Utils.formatNumber(d.score)}</span></td>
                <td>${Utils.formatNumber(d.miles)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- MOST IMPROVED -->
      <div class="card spotlight-card">
        <div class="card-header">
          <span class="card-title">Most Improved Driver</span>
          <span class="card-right">Score</span>
        </div>
        <div class="spotlight-name link-text">${mostImproved?.name || '-'}</div>
        <div class="spotlight-group">${mostImproved?.vehicleName || ''}</div>
        <div class="spotlight-score">${Utils.formatNumber(mostImproved?.score)}</div>
        <div>${mostImproved ? Utils.trendBadge(mostImproved.trend) : ''}</div>
      </div>

      <!-- LOWEST TRENDING -->
      <div class="card spotlight-card alert-card">
        <div class="card-header">
          <span class="card-title">Lowest Trending Driver</span>
          <span class="card-right">Score</span>
        </div>
        <div class="spotlight-name link-text">${lowestTrend?.name || '-'}</div>
        <div class="spotlight-group">${lowestTrend?.vehicleName || ''}</div>
        <div class="spotlight-score alert-score">${Utils.formatNumber(lowestTrend?.score)}</div>
        <div>${lowestTrend ? Utils.trendBadge(lowestTrend.trend) : ''}</div>
      </div>

      <!-- TOP 3 EVENTS -->
      <div class="card top-events-card">
        <div class="card-header">
          <span class="card-title">Top 3 Events</span>
          <span class="card-subtitle">Total triggered events</span>
          <button class="btn-expand">↗</button>
        </div>
        <table class="data-table">
          <thead>
            <tr><th>EVENTS ↕</th><th>AMOUNT ↓</th><th>TREND ↕</th></tr>
          </thead>
          <tbody>
            ${top3Events.map((evt, i) => {
              const barColors = ['#FF6F00', '#FFC107', '#F44336'];
              const barW = Math.min(100, Math.round((evt.count / (top3Events[0]?.count || 1)) * 100));
              return `
              <tr>
                <td>${evt.name}</td>
                <td>
                  <div class="event-bar-wrap">
                    <div class="event-bar" style="width:${barW}%;background:${barColors[i] || '#999'}"></div>
                    <span>${evt.count}</span>
                  </div>
                </td>
                <td>${Utils.trendBadge(evt.trend)}</td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- LOWEST PERFORMANCE -->
      <div class="card bottom5-card">
        <div class="card-header"><span class="card-title">Lowest Performance Drivers</span></div>
        <table class="data-table">
          <thead>
            <tr><th>DRIVER ↕</th><th>VEHICLE ↕</th><th>SCORE ↕</th><th>MILES ↕</th></tr>
          </thead>
          <tbody>
            ${bottom5.map(d => `
              <tr>
                <td class="link-text">${d.name}</td>
                <td class="link-text">${d.vehicleName}</td>
                <td><span class="score-badge high-score">${Utils.formatNumber(d.score)}</span></td>
                <td>${Utils.formatNumber(d.miles)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

    </div>
    `;
  },

  initDonutChart(canvasId, { highCount, mediumCount, lowCount }) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['High', 'Medium', 'Low'],
        datasets: [{
          data: [highCount, mediumCount, lowCount],
          backgroundColor: ['#F44336', '#FF9800', '#4CAF50'],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.raw} drivers`
            }
          }
        }
      }
    });
  },

  initTopEventsChart(canvasId, events) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: events.map(e => e.name),
        datasets: [{
          data: events.map(e => e.count),
          backgroundColor: ['#FF6F00', '#FFC107', '#F44336'],
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } }
      }
    });
  }
};

window.LeaderboardPage = LeaderboardPage;
