/**
 * src/pages/homepage.js — Homepage (Vue 3 + GridStack drag/resize)
 * All widgets wrapped in grid-stack-item divs.
 * Drag the card header to move, drag corner to resize.
 */
window.DynHomepage = {
  name: 'DynHomepage',
  props: { api: Object, fromDate: Date, toDate: Date, period: String, groupIds: Array, settings: Object },

  setup(props) {
    const { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } = Vue;

    const loading      = ref(true);
    const error        = ref(null);
    const currentScore = ref(0);
    const medianScore  = ref(0);
    const trend        = ref(0);
    const gpsOffline   = ref(0);
    const totalDevices = ref(0);
    const camOffline   = ref(0);
    const camTotal     = ref(0);
    const topEvents    = ref([]);
    const trendScores  = ref([]);
    const coachingData = ref([]);
    const groupRows    = ref([]);
    const driverRows   = ref([]);
    const activeTab    = ref('groups');

    let gaugeChart = null, trendChart = null, coachingChart = null;

    const show = computed(() => {
      const s = props.settings || window.DynStore?.settings || {};
      return {
        scoreTrend:       s.scoreTrend       !== false,
        gpsOffline:       s.gpsOffline       !== false,
        cameraOffline:    s.cameraOffline    !== false,
        fleetPerformance: s.fleetPerformance !== false,
        insights:         s.insights         !== false,
        coachingSnapshot: s.coachingSnapshot !== false,
        eventPerformance: s.eventPerformance !== false,
      };
    });

    const scoreTier  = computed(() => Utils.getScoreTier(currentScore.value));
    const scoreColor = computed(() => scoreTier.value?.color || '#4CAF50');
    const scoreCat   = computed(() => scoreTier.value?.label || 'Very Low');
    const trendPos   = computed(() => trend.value > 0);
    const trendColor = computed(() => trendPos.value ? '#F44336' : '#4CAF50');
    const trendArrow = computed(() => trendPos.value ? '↑' : '↓');
    const trendSign  = computed(() => trendPos.value ? '+' : '');

    const insightHtml = computed(() => {
      const rows = driverRows.value.filter(d => d.score !== null);
      const worst = [...rows].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      const top   = topEvents.value[0];
      let html = '';
      if (worst) {
        const t = Utils.getScoreTier(worst.score);
        html += `<p><span style="color:${t?.color||'#F44336'}">&#9679;</span> Driver <strong>${worst.name}</strong> has the highest score: <strong>${Utils.formatNumber(worst.score)}</strong> points.</p>`;
      }
      if (top) {
        html += `<p>Most common event: <strong>${top.name}</strong> — ${top.count} occurrences.</p>`;
      }
      return html || '<p>No notable insights for this period.</p>';
    });

    const loadData = async () => {
      loading.value = true; error.value = null;
      try {
        const api = props.api;
        const { fromDate, toDate, groupIds } = props;
        const [events, ruleMap, dsl, devices, drivers, trips, coaching] = await Promise.all([
          api.getExceptionEvents(fromDate, toDate, groupIds),
          api.getRuleMap(),
          api.getDeviceStatusInfo(groupIds),
          api.getDevices(groupIds),
          api.getDrivers(groupIds),
          api.getTrips(fromDate, toDate, groupIds),
          api.getAnnotationLogs(fromDate, toDate, groupIds),
        ]);
        const ms       = toDate - fromDate;
        const prevEvts = await api.getExceptionEvents(new Date(fromDate - ms), new Date(fromDate), groupIds);

        currentScore.value = Utils.calculateScore(events, ruleMap);
        const prevScore    = Utils.calculateScore(prevEvts, ruleMap);
        trend.value        = Utils.calcTrend(currentScore.value, prevScore);

        const dEvMap   = api.groupEventsByDriver(events);
        const sc       = drivers.map(d => Utils.calculateScore(dEvMap[d.id]||[], ruleMap)).filter(s=>s>0).sort((a,b)=>a-b);
        medianScore.value = sc.length ? sc[Math.floor(sc.length/2)] : 0;

        gpsOffline.value   = api.countOfflineDevices(dsl, 5);
        totalDevices.value = dsl.length;
        const cams         = devices.filter(d => (d.deviceType||'').toLowerCase().includes('surfsight')||(d.name||'').toLowerCase().includes('cam'));
        camTotal.value     = cams.length || dsl.length;
        camOffline.value   = dsl.filter(ds => cams.some(c=>c.id===ds.device?.id) && !ds.isDeviceCommunicating).length;

        const ec = {}, pc = {};
        events.forEach(e     => { const n=ruleMap[e.rule?.id]||'Unknown'; ec[n]=(ec[n]||0)+1; });
        prevEvts.forEach(e   => { const n=ruleMap[e.rule?.id]||'Unknown'; pc[n]=(pc[n]||0)+1; });
        topEvents.value = Object.entries(ec).sort((a,b)=>b[1]-a[1])
          .map(([name,count]) => ({ name, count, trend: Utils.calcTrend(count, pc[name]||0) }));

        const p6     = Utils.getLast6Periods();
        trendScores.value = await Promise.all(p6.map(async p => {
          const pe = await api.getExceptionEvents(p.fromDate, p.toDate, groupIds);
          return { label: p.label, score: Utils.calculateScore(pe, ruleMap) };
        }));

        coachingData.value = p6.map(p => {
          const logs = coaching.filter(l => { const d=new Date(l.dateTime||l.logTime||l.date); return d>=p.fromDate&&d<=p.toDate; });
          return { label: p.label, events: logs.length, views: logs.filter(l=>l.viewed).length };
        });

        const groups  = await api.getGroups();
        const devEvMap = api.groupEventsByDevice(events);
        groupRows.value = groups.slice(0,10).map(g => {
          const gd = devices.filter(d=>(d.groups||[]).some(dg=>dg.id===g.id));
          const ge = []; gd.forEach(d=>(devEvMap[d.id]||[]).forEach(e=>ge.push(e)));
          const score = ge.length ? Utils.calculateScore(ge, ruleMap) : null;
          const gc = coaching.filter(l=>gd.some(d=>d.id===l.device?.id));
          return { name: g.name, score, trend: 0, coaching: gc.length, views: gc.filter(l=>l.viewed).length };
        });
        driverRows.value = drivers.map(d => {
          const de    = dEvMap[d.id]||[];
          const score = de.length ? Utils.calculateScore(de, ruleMap) : null;
          const dc    = coaching.filter(l=>l.driver?.id===d.id||l.user?.id===d.id);
          return { name: ((d.firstName||'')+' '+(d.lastName||d.name||'')).trim(), score, trend:0, coaching:dc.length, views:dc.filter(l=>l.viewed).length };
        });
      } catch (err) {
        error.value = err.message;
      } finally {
        loading.value = false;
        await nextTick();
        initCharts();
      }
    };

    const isDark = () => document.getElementById('dyn-app')?.classList.contains('dyn-dark');

    const initCharts = () => {
      initGauge(); initTrend(); initCoaching();
    };

    const initGauge = () => {
      const canvas = document.getElementById('hp-gauge');
      if (!canvas) return;
      const dark = isDark();
      const card = canvas.closest('.ga-score-card');
      const W    = card ? card.clientWidth - 32 : 220;
      canvas.width = W; canvas.height = Math.round(W*0.55);
      const ctx = canvas.getContext('2d');
      const cx=W/2, cy=canvas.height-12, r=Math.round(W*0.36), lw=Math.round(W*0.07);
      const pct = Math.min(currentScore.value/10000, 1);
      ctx.clearRect(0,0,W,canvas.height);
      ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI,2*Math.PI);
      ctx.strokeStyle=dark?'#2D3046':'#EEEEEE'; ctx.lineWidth=lw; ctx.lineCap='butt'; ctx.stroke();
      [[0,.10,'#4CAF50'],[.10,.20,'#8BC34A'],[.20,.40,'#FFEB3B'],[.40,.55,'#FF9800'],[.55,.70,'#FF5722'],[.70,1,'#F44336']].forEach(([f,t,c])=>{
        ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI+f*Math.PI,Math.PI+t*Math.PI);
        ctx.strokeStyle=c; ctx.lineWidth=lw; ctx.lineCap='butt'; ctx.stroke();
      });
      if(pct<1){ ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI+pct*Math.PI,2*Math.PI); ctx.strokeStyle=dark?'#2D3046':'#EEEEEE'; ctx.lineWidth=lw; ctx.lineCap='butt'; ctx.stroke(); }
      const na=Math.PI+pct*Math.PI, nl=r-lw/2-2, nc=dark?'#E8EAF0':'#424242';
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(na);
      ctx.beginPath(); ctx.moveTo(nl,0); ctx.lineTo(-8,-3); ctx.lineTo(-8,3);
      ctx.closePath(); ctx.fillStyle=nc; ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.arc(cx,cy,5,0,2*Math.PI); ctx.fillStyle=nc; ctx.fill();
      const fs=Math.max(10,Math.round(W*0.036)), tc=dark?'#8B90A8':'#9E9E9E';
      ctx.fillStyle=tc; ctx.font=`${fs}px Segoe UI,Arial,sans-serif`;
      ctx.textAlign='left'; ctx.fillText('0',cx-r-lw/2-2,cy+14);
      ctx.textAlign='center'; ctx.fillText('5000',cx,cy-r-lw/2-4);
      ctx.textAlign='right'; ctx.fillText('10000+',cx+r+lw/2+2,cy+14);
    };

    const barColor = v => v>5000?'#F44336':v>=2000?'#FF9800':v>=1000?'#FFEB3B':'#4CAF50';

    const initTrend = () => {
      const canvas = document.getElementById('hp-trend');
      if (!canvas) return;
      if (trendChart) { trendChart.destroy(); trendChart=null; }
      const dark=isDark(), gc=dark?'#2D3046':'#F0F0F0', tc=dark?'#8B90A8':'#666';
      const scores = trendScores.value.map(p=>p.score);
      trendChart = new Chart(canvas, {
        type:'bar',
        data:{ labels:trendScores.value.map(p=>p.label), datasets:[{ data:scores, backgroundColor:scores.map(v=>barColor(v)), borderRadius:3 }] },
        options:{ responsive:true, plugins:{ legend:{display:false} }, scales:{ y:{beginAtZero:true,grid:{color:gc},ticks:{color:tc,maxTicksLimit:6}}, x:{grid:{display:false},ticks:{color:tc}} } },
      });
    };

    const initCoaching = () => {
      const canvas = document.getElementById('hp-coaching');
      if (!canvas) return;
      if (coachingChart) { coachingChart.destroy(); coachingChart=null; }
      const tc = isDark()?'#8B90A8':'#666';
      coachingChart = new Chart(canvas, {
        type:'bar',
        data:{ labels:coachingData.value.map(p=>p.label), datasets:[
          { label:'Views',           data:coachingData.value.map(p=>p.views),  backgroundColor:'#4CAF50', borderRadius:3 },
          { label:'Coaching Events', data:coachingData.value.map(p=>p.events), backgroundColor:'#1565C0', borderRadius:3 },
        ]},
        options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true,ticks:{color:tc,maxTicksLimit:5}}, x:{grid:{display:false},ticks:{color:tc}} } },
      });
    };

    onMounted(loadData);
    onBeforeUnmount(() => {
      if (trendChart)    { trendChart.destroy(); }
      if (coachingChart) { coachingChart.destroy(); }
    });

    return {
      loading, error, currentScore, medianScore, trend,
      gpsOffline, totalDevices, camOffline, camTotal,
      topEvents, groupRows, driverRows, activeTab,
      show, insightHtml, scoreColor, scoreCat,
      trendColor, trendArrow, trendSign,
      fmt:        Utils.formatNumber.bind(Utils),
      scoreBadge: Utils.scoreBadge.bind(Utils),
      trendBadge: Utils.trendBadge.bind(Utils),
    };
  },

  template: `
    <div>
      <DynLoading v-if="loading" />
      <DynError v-else-if="error" :message="error" />
      <DynEditableGrid v-else page="homepage" :api="api">

        <!-- SCORE GAUGE -->
        <div class="grid-stack-item" gs-id="widget-score-gauge" gs-x="0" gs-y="0" gs-w="3" gs-h="6">
          <div class="grid-stack-item-content card ga-score-card">
            <div class="card-header gs-drag-handle">
              <span class="card-title">Dynasty Communications Score</span>
            </div>
            <div class="ga-score-meta">
              <div class="ga-meta-row">
                <span class="ga-meta-label">&#9654; Current Score</span>
                <span class="ga-meta-num">{{ fmt(currentScore) }}</span>
                <span class="ga-meta-trend" :style="{ color: trendColor }">{{ trendSign }}{{ Math.abs(trend) }}% {{ trendArrow }}</span>
              </div>
              <div class="ga-meta-row">
                <span class="ga-meta-label">&#9642; Company Median Score</span>
                <span class="ga-meta-num">{{ fmt(medianScore) }}</span>
              </div>
            </div>
            <canvas id="hp-gauge"></canvas>
            <div class="ga-gauge-num" :style="{ color: scoreColor }">{{ fmt(currentScore) }}</div>
            <div class="ga-gauge-cat" :style="{ color: scoreColor, borderColor: scoreColor }">{{ scoreCat }}</div>
            <div class="ga-gauge-pct" :style="{ color: trendColor }">{{ trendSign }}{{ Math.abs(trend) }}% {{ trendArrow }}</div>
          </div>
        </div>

        <!-- SCORE TREND -->
        <div v-show="show.scoreTrend" class="grid-stack-item" gs-id="widget-score-trend" gs-x="3" gs-y="0" gs-w="6" gs-h="6">
          <div class="grid-stack-item-content card ga-trend-card">
            <div class="card-header gs-drag-handle">
              <div>
                <div class="card-title">Dynasty Communications Score Trend</div>
                <div class="card-subtitle">Throughout the last 6 periods</div>
              </div>
            </div>
            <canvas id="hp-trend" style="height:100%;width:100%"></canvas>
          </div>
        </div>

        <!-- GPS OFFLINE -->
        <div v-show="show.gpsOffline" class="grid-stack-item" gs-id="widget-gps-offline" gs-x="9" gs-y="0" gs-w="3" gs-h="3">
          <div class="grid-stack-item-content card ga-kpi-card">
            <div class="ga-kpi-top gs-drag-handle">
              <span class="ga-kpi-title">GPS Offline</span>
              <span class="ga-kpi-sub">5 days or more</span>
            </div>
            <div class="ga-kpi-body">
              <svg class="ga-kpi-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2C8.686 2 6 4.686 6 8c0 5 6 13 6 13s6-8 6-13c0-3.314-2.686-6-6-6z"/>
                <circle cx="12" cy="8" r="2.5"/>
              </svg>
              <div class="ga-kpi-num" :class="{ 'ga-kpi-alert': gpsOffline > 0 }">{{ gpsOffline }}/{{ totalDevices }}</div>
            </div>
          </div>
        </div>

        <!-- CAMERAS OFFLINE -->
        <div v-show="show.cameraOffline" class="grid-stack-item" gs-id="widget-cam-offline" gs-x="9" gs-y="3" gs-w="3" gs-h="3">
          <div class="grid-stack-item-content card ga-kpi-card">
            <div class="ga-kpi-top gs-drag-handle">
              <span class="ga-kpi-title">Cameras Offline</span>
              <span class="ga-kpi-sub">5 days or more</span>
            </div>
            <div class="ga-kpi-body">
              <svg class="ga-kpi-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M23 7l-7 5 7 5V7z"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
              <div class="ga-kpi-num" :class="{ 'ga-kpi-alert': camOffline > 0 }">{{ camOffline }}/{{ camTotal }}</div>
            </div>
          </div>
        </div>

        <!-- FLEET PERFORMANCE -->
        <div v-show="show.fleetPerformance" class="grid-stack-item" gs-id="widget-fleet-perf" gs-x="0" gs-y="6" gs-w="8" gs-h="8">
          <div class="grid-stack-item-content card ga-perf-card">
            <div class="card-header gs-drag-handle">
              <div>
                <div class="card-title">Dynasty Communications Performance</div>
                <div class="card-subtitle">Total unsafe driving points</div>
              </div>
            </div>
            <div class="table-tabs">
              <button class="tab-btn" :class="{ active: activeTab==='groups' }"  @click="activeTab='groups'">Groups ({{ groupRows.length }})</button>
              <button class="tab-btn" :class="{ active: activeTab==='drivers' }" @click="activeTab='drivers'">Drivers ({{ driverRows.length }})</button>
            </div>
            <div class="table-scroll" v-if="activeTab==='groups'">
              <table class="data-table">
                <thead><tr><th>GROUP</th><th>SCORE</th><th>TREND</th><th>COACHING</th><th>VIEWS</th></tr></thead>
                <tbody>
                  <tr v-for="r in groupRows" :key="r.name">
                    <td class="link-text">{{ r.name }}</td>
                    <td v-html="scoreBadge(r.score)"></td>
                    <td v-html="r.score!==null ? trendBadge(r.trend) : '—'"></td>
                    <td>{{ r.coaching }}</td><td>{{ r.views }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="table-scroll" v-else>
              <table class="data-table">
                <thead><tr><th>DRIVER</th><th>SCORE</th><th>TREND</th><th>COACHING</th><th>VIEWS</th></tr></thead>
                <tbody>
                  <tr v-for="r in driverRows" :key="r.name">
                    <td class="link-text">{{ r.name }}</td>
                    <td v-html="scoreBadge(r.score)"></td>
                    <td v-html="r.score!==null ? trendBadge(r.trend) : '—'"></td>
                    <td>{{ r.coaching }}</td><td>{{ r.views }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- INSIGHTS -->
        <div v-show="show.insights" class="grid-stack-item" gs-id="widget-insights" gs-x="8" gs-y="6" gs-w="4" gs-h="4">
          <div class="grid-stack-item-content card ga-insights-card">
            <div class="card-header gs-drag-handle">
              <div><div class="card-title">Insights</div><div class="card-subtitle">Rule-based analysis</div></div>
            </div>
            <div class="ga-insights-body" v-html="insightHtml"></div>
          </div>
        </div>

        <!-- COACHING SNAPSHOT -->
        <div v-show="show.coachingSnapshot" class="grid-stack-item" gs-id="widget-coaching-snap" gs-x="8" gs-y="10" gs-w="4" gs-h="4">
          <div class="grid-stack-item-content card ga-coaching-card">
            <div class="card-header gs-drag-handle">
              <div><div class="card-title">Coaching Snapshot</div><div class="card-subtitle">Last 6 periods</div></div>
            </div>
            <canvas id="hp-coaching" style="max-height:180px"></canvas>
            <div class="chart-legend" style="margin-top:4px">
              <span class="legend-item"><span class="legend-dot" style="background:#4CAF50"></span>Views</span>
              <span class="legend-item"><span class="legend-dot" style="background:#1565C0"></span>Coaching</span>
            </div>
          </div>
        </div>

        <!-- EVENT PERFORMANCE -->
        <div v-show="show.eventPerformance" class="grid-stack-item" gs-id="widget-event-perf" gs-x="0" gs-y="14" gs-w="12" gs-h="5">
          <div class="grid-stack-item-content card ga-events-card">
            <div class="card-header gs-drag-handle">
              <div><div class="card-title">Event Performance</div><div class="card-subtitle">Exception events compared to last period</div></div>
            </div>
            <table class="data-table">
              <thead><tr><th>EVENTS</th><th>AMOUNT</th><th>TREND</th></tr></thead>
              <tbody>
                <tr v-for="evt in topEvents" :key="evt.name">
                  <td>{{ evt.name }}</td>
                  <td>
                    <div class="ga-event-bar-wrap">
                      <div class="ga-event-bar" :style="{ width: Math.min(100,Math.round((evt.count/(topEvents[0]?.count||1))*100))+'%', background: evt.count>100?'#F44336':evt.count>50?'#FF9800':evt.count>20?'#FFC107':'#4CAF50' }"></div>
                      <span class="ga-event-count">{{ evt.count }}</span>
                    </div>
                  </td>
                  <td v-html="trendBadge(evt.trend)"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </DynEditableGrid>
    </div>
  `,
};
