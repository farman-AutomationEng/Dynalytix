/**
 * src/pages/leaderboard.js — Leaderboard (Vue 3 Component)
 * Wraps existing LeaderboardPage logic in Vue lifecycle.
 */
window.DynLeaderboard = {
  name: 'DynLeaderboard',
  props: { api: Object, fromDate: Date, toDate: Date, period: String, groupIds: Array },
  setup(props) {
    const { ref, onMounted, onBeforeUnmount, nextTick } = Vue;
    const loading = ref(true);
    const error   = ref(null);
    const html    = ref('');
    let chartInstances = [];

    const loadData = async () => {
      loading.value = true; error.value = null;
      try {
        const [events, prevEvents, ruleMap, drivers, devices, trips] = await Promise.all([
          props.api.getExceptionEvents(props.fromDate, props.toDate, props.groupIds),
          props.api.getExceptionEvents(
            new Date(props.fromDate.getTime() - (props.toDate - props.fromDate)),
            new Date(props.fromDate), props.groupIds
          ),
          props.api.getRuleMap(),
          props.api.getDrivers(props.groupIds),
          props.api.getDevices(props.groupIds),
          props.api.getTrips(props.fromDate, props.toDate, props.groupIds),
        ]);

        const driverEvMap     = props.api.groupEventsByDriver(events);
        const prevDriverEvMap = props.api.groupEventsByDriver(prevEvents);
        const deviceDriverMap = {};
        events.forEach(e => { if (e.device?.id && e.driver?.id) deviceDriverMap[e.device.id] = e.driver.id; });

        const driverData = drivers.map(d => {
          const dEvts    = driverEvMap[d.id] || [];
          const prevEvts = prevDriverEvMap[d.id] || [];
          const score    = Utils.calculateScore(dEvts, ruleMap);
          const prev     = Utils.calculateScore(prevEvts, ruleMap);
          const dTrips   = trips.filter(t => t.driver?.id === d.id);
          const miles    = dTrips.reduce((s, t) => s + Utils.metersToMiles(t.distance || 0), 0);
          const vehicle  = devices.find(dev => deviceDriverMap[dev.id] === d.id);
          return {
            id: d.id,
            name: ((d.firstName || '') + ' ' + (d.lastName || d.name || '')).trim(),
            vehicleName: vehicle?.name || '—',
            score, prev, trend: Utils.calcTrend(score, prev), miles,
            category: Utils.getScoreCategory(score),
          };
        }).filter(d => d.miles > 0 || d.score > 0);

        const highCount   = driverData.filter(d => d.category === 'High').length;
        const mediumCount = driverData.filter(d => d.category === 'Medium').length;
        const lowCount    = driverData.filter(d => d.category === 'Low').length;
        const veryLowCount= driverData.filter(d => d.category === 'Very Low').length;
        const total       = driverData.length;

        const sorted      = [...driverData].sort((a, b) => a.trend - b.trend);
        const improved    = sorted[0];
        const lowestTrend = sorted[sorted.length - 1];

        const evtCounts = {}, prevEvtCounts = {};
        events.forEach(e     => { const n = ruleMap[e.rule?.id]||'Unknown'; evtCounts[n]    = (evtCounts[n]    ||0)+1; });
        prevEvents.forEach(e => { const n = ruleMap[e.rule?.id]||'Unknown'; prevEvtCounts[n]= (prevEvtCounts[n]||0)+1; });
        const top3 = Object.entries(evtCounts).sort((a,b)=>b[1]-a[1]).slice(0,3)
          .map(([name, count]) => ({ name, count, trend: Utils.calcTrend(count, prevEvtCounts[name]||0) }));

        const top5    = [...driverData].sort((a,b) => a.score-b.score).slice(0,5);
        const bottom5 = [...driverData].sort((a,b) => b.score-a.score).slice(0,5);

        const pct = (n) => total > 0 ? ((n/total)*100).toFixed(1) : 0;

        html.value = `
          <div class="leaderboard-grid">
            <div class="card donut-card">
              <div class="card-header"><span class="card-title">Score Breakdown</span><span class="card-subtitle">Count of drivers in each category</span></div>
              <div class="donut-wrapper">
                <canvas id="lb-donut" width="220" height="220"></canvas>
                <div class="donut-legend">
                  <div class="donut-legend-item"><span class="dot red"></span>High: ${pct(highCount)}%</div>
                  <div class="donut-legend-item"><span class="dot orange"></span>Medium: ${pct(mediumCount)}%</div>
                  <div class="donut-legend-item"><span class="dot" style="background:#FFEB3B"></span>Low: ${pct(lowCount)}%</div>
                  <div class="donut-legend-item"><span class="dot green"></span>Very Low: ${pct(veryLowCount)}%</div>
                </div>
              </div>
            </div>
            <div class="card top5-card">
              <div class="card-header"><span class="card-title">Top 5 Performers</span></div>
              <table class="data-table"><thead><tr><th>DRIVER</th><th>VEHICLE</th><th>SCORE</th><th>MILES</th></tr></thead><tbody>
                ${top5.map(d => `<tr><td class="link-text">${d.name}</td><td>${d.vehicleName}</td><td>${Utils.scoreBadge(d.score)}</td><td>${Utils.formatNumber(d.miles)}</td></tr>`).join('')}
              </tbody></table>
            </div>
            <div class="card spotlight-card">
              <div class="card-header"><span class="card-title">Most Improved</span></div>
              <div class="spotlight-name link-text">${improved?.name || '—'}</div>
              <div class="spotlight-group">${improved?.vehicleName || ''}</div>
              <div class="spotlight-score">${Utils.formatNumber(improved?.score)}</div>
              <div>${improved ? Utils.trendBadge(improved.trend) : ''}</div>
            </div>
            <div class="card spotlight-card alert-card">
              <div class="card-header"><span class="card-title">Lowest Trending</span></div>
              <div class="spotlight-name link-text">${lowestTrend?.name || '—'}</div>
              <div class="spotlight-group">${lowestTrend?.vehicleName || ''}</div>
              <div class="spotlight-score alert-score">${Utils.formatNumber(lowestTrend?.score)}</div>
              <div>${lowestTrend ? Utils.trendBadge(lowestTrend.trend) : ''}</div>
            </div>
            <div class="card top-events-card">
              <div class="card-header"><span class="card-title">Top 3 Events</span></div>
              <table class="data-table"><thead><tr><th>EVENT</th><th>AMOUNT</th><th>TREND</th></tr></thead><tbody>
                ${top3.map((e,i) => {
                  const colors = ['#F44336','#FF9800','#FFC107'];
                  const bw = Math.min(100, Math.round((e.count/(top3[0]?.count||1))*100));
                  return `<tr><td>${e.name}</td><td><div class="ga-event-bar-wrap"><div class="ga-event-bar" style="width:${bw}%;background:${colors[i]}"></div><span>${e.count}</span></div></td><td>${Utils.trendBadge(e.trend)}</td></tr>`;
                }).join('')}
              </tbody></table>
            </div>
            <div class="card bottom5-card">
              <div class="card-header"><span class="card-title">Lowest Performance</span></div>
              <table class="data-table"><thead><tr><th>DRIVER</th><th>VEHICLE</th><th>SCORE</th><th>MILES</th></tr></thead><tbody>
                ${bottom5.map(d => `<tr><td class="link-text">${d.name}</td><td>${d.vehicleName}</td><td>${Utils.scoreBadge(d.score)}</td><td>${Utils.formatNumber(d.miles)}</td></tr>`).join('')}
              </tbody></table>
            </div>
          </div>`;

        await nextTick();

        // Donut chart
        const canvas = document.getElementById('lb-donut');
        if (canvas) {
          const c = new Chart(canvas, {
            type: 'doughnut',
            data: {
              labels: ['High','Medium','Low','Very Low'],
              datasets: [{ data: [highCount, mediumCount, lowCount, veryLowCount],
                backgroundColor: ['#F44336','#FF9800','#FFEB3B','#4CAF50'],
                borderWidth: 2, borderColor: '#fff' }],
            },
            options: { cutout: '65%', plugins: { legend: { display: false } } },
          });
          chartInstances.push(c);
        }
      } catch (err) {
        error.value = err.message;
      } finally {
        loading.value = false;
      }
    };

    onMounted(loadData);
    onBeforeUnmount(() => { chartInstances.forEach(c => c.destroy()); chartInstances = []; });
    return { loading, error, html };
  },
  template: `
    <div>
      <DynLoading v-if="loading" />
      <DynError v-else-if="error" :message="error" />
      <div v-else v-html="html"></div>
    </div>`,
};
