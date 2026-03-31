/** src/pages/scored-events.js — Vue 3 Component */
window.DynScoredEvents = {
  name: 'DynScoredEvents',
  props: { api: Object, fromDate: Date, toDate: Date, period: String, groupIds: Array, vehicleMode: Boolean, settings: Object },
  setup(props) {
    const { ref, computed, onMounted } = Vue;
    const loading = ref(true);
    const error   = ref(null);
    const orderedRules   = ref([]);
    const currentCounts  = ref({});
    const prevCounts     = ref({});
    const totalIdleSec   = ref(0);
    const entityRows     = ref([]);
    const sortCol        = ref(null);
    const sortDir        = ref(1);
    const searchQ        = ref('');
    const activeFilter   = ref('all');

    const loadData = async () => {
      loading.value = true; error.value = null;
      try {
        const periodMs = props.toDate - props.fromDate;
        const [events, prevEvents, allRules, drivers, devices, trips] = await Promise.all([
          props.api.getExceptionEvents(props.fromDate, props.toDate, props.groupIds),
          props.api.getExceptionEvents(new Date(props.fromDate.getTime() - periodMs), new Date(props.fromDate), props.groupIds),
          props.api.getAllRulesEnriched(),
          props.api.getDrivers(props.groupIds),
          props.api.getDevices(props.groupIds),
          props.api.getTrips(props.fromDate, props.toDate, props.groupIds),
        ]);

        const activeIds = new Set(events.map(e => e.rule?.id).filter(Boolean));
        const cc = {}, pc = {};
        events.forEach(e     => { if (e.rule?.id) cc[e.rule.id] = (cc[e.rule.id]||0)+1; });
        prevEvents.forEach(e => { if (e.rule?.id) pc[e.rule.id] = (pc[e.rule.id]||0)+1; });
        currentCounts.value = cc; prevCounts.value = pc;

        orderedRules.value = [
          ...allRules.filter(r => activeIds.has(r.id)),
          ...(allRules.length <= 50 ? allRules.filter(r => !activeIds.has(r.id)) : []),
        ];

        totalIdleSec.value = trips.reduce((s,t) => s + (t.idlingDuration||0), 0);

        const entities      = props.vehicleMode ? devices : drivers;
        const byEntity      = props.vehicleMode ? props.api.groupEventsByDevice(events) : props.api.groupEventsByDriver(events);
        entityRows.value = entities.map(entity => {
          const evts     = byEntity[entity.id] || [];
          const ruleCounts = {};
          evts.forEach(e => { if (e.rule?.id) ruleCounts[e.rule.id] = (ruleCounts[e.rule.id]||0)+1; });
          const eTrips   = trips.filter(t => props.vehicleMode ? t.device?.id === entity.id : t.driver?.id === entity.id);
          const idleSec  = eTrips.reduce((s,t) => s+(t.idlingDuration||0), 0);
          const name     = props.vehicleMode ? entity.name : ((entity.firstName||'') + ' ' + (entity.lastName||entity.name||'')).trim();
          const total    = Object.values(ruleCounts).reduce((s,v)=>s+v,0);
          return { id: entity.id, name: name||'—', ruleCounts, idleSec, total };
        }).filter(r => r.total > 0 || r.idleSec > 0).sort((a,b) => b.total - a.total);
      } catch (err) { error.value = err.message; }
      finally { loading.value = false; }
    };

    onMounted(loadData);

    const activeRules = computed(() => orderedRules.value.filter(r => (currentCounts.value[r.id]||0) > 0));
    const filteredRules = computed(() => {
      if (activeFilter.value === 'camera')    return activeRules.value.filter(r => r.isCamera);
      if (activeFilter.value === 'telematics')return activeRules.value.filter(r => !r.isCamera);
      return activeRules.value;
    });

    const filteredRows = computed(() => {
      const q = searchQ.value.toLowerCase();
      return entityRows.value.filter(r => !q || r.name.toLowerCase().includes(q));
    });

    const sortedRows = computed(() => {
      if (sortCol.value === null) return filteredRows.value;
      return [...filteredRows.value].sort((a, b) => {
        const getVal = (r) => {
          if (sortCol.value === 'name')    return r.name;
          if (sortCol.value === 'idle')    return r.idleSec;
          return r.ruleCounts[sortCol.value] || 0;
        };
        const av = getVal(a), bv = getVal(b);
        if (typeof av === 'string') return av.localeCompare(bv) * sortDir.value;
        return (av - bv) * sortDir.value;
      });
    });

    const doSort = (col) => {
      if (sortCol.value === col) sortDir.value *= -1;
      else { sortCol.value = col; sortDir.value = 1; }
    };

    const barCol = (v) => v > 100 ? '#F44336' : v > 50 ? '#FF9800' : v > 20 ? '#FFC107' : '#4CAF50';

    return {
      loading, error, activeFilter, searchQ,
      activeRules, filteredRules, sortedRows, currentCounts, prevCounts,
      totalIdleSec, sortCol, sortDir, doSort, barCol,
      formatNumber: Utils.formatNumber.bind(Utils),
      secondsToHMS: Utils.secondsToHMS.bind(Utils),
      trendBadge:   Utils.trendBadge.bind(Utils),
      calcTrend:    Utils.calcTrend.bind(Utils),
      vehicleMode:  computed(() => props.vehicleMode),
    };
  },
  template: `
    <div>
      <DynLoading v-if="loading" />
      <DynError v-else-if="error" :message="error" />
      <div v-else class="scored-events-page">
        <div class="se-summary-bar">
          <span><strong>{{ activeRules.length }}</strong> active rules</span>
          <span><strong>{{ activeRules.filter(r=>!r.isCamera).length }}</strong> telematics</span>
          <span><strong>{{ activeRules.filter(r=>r.isCamera).length }}</strong> camera AI</span>
        </div>
        <div class="se-filter-tabs">
          <button class="se-filter-btn" :class="{ 'se-filter-active': activeFilter==='all' }" @click="activeFilter='all'">All Rules ({{ activeRules.length }})</button>
          <button class="se-filter-btn" :class="{ 'se-filter-active': activeFilter==='telematics' }" @click="activeFilter='telematics'">Telematics</button>
          <button class="se-filter-btn" :class="{ 'se-filter-active': activeFilter==='camera' }" @click="activeFilter='camera'">[CAM] Camera AI</button>
        </div>
        <div class="kpi-events-grid">
          <div v-for="r in filteredRules" :key="r.id" class="card kpi-event-card" :class="{ alert: r.isCamera && (currentCounts[r.id]||0) > 0 }">
            <div class="kpi-event-label">{{ r.isCamera ? '[CAM] ' : '' }}{{ r.name }}</div>
            <div class="kpi-event-count">{{ currentCounts[r.id] || 0 }}</div>
            <div class="kpi-event-trend" v-html="trendBadge(calcTrend(currentCounts[r.id]||0, prevCounts[r.id]||0))"></div>
          </div>
          <div class="card kpi-event-card">
            <div class="kpi-event-label">Idle Time (HH:MM:SS)</div>
            <div class="kpi-event-count small">{{ secondsToHMS(totalIdleSec) }}</div>
          </div>
        </div>
        <div class="card table-card">
          <div class="card-header">
            <span class="card-title">{{ sortedRows.length }} {{ vehicleMode ? 'Vehicles' : 'Drivers' }}</span>
            <span class="card-subtitle">Click column header to sort A-Z or Z-A</span>
            <input class="search-input" v-model="searchQ" placeholder="Search..." />
          </div>
          <div class="table-scroll">
            <table class="data-table dense-table se-main-table">
              <thead>
                <tr>
                  <th class="se-sticky-col" @click="doSort('name')" style="cursor:pointer">
                    {{ vehicleMode ? 'VEHICLE' : 'DRIVER' }} {{ sortCol==='name' ? (sortDir===1?'↑':'↓') : '↕' }}
                  </th>
                  <th @click="doSort('idle')" style="cursor:pointer">IDLE TIME {{ sortCol==='idle'?(sortDir===1?'↑':'↓'):'↕' }}</th>
                  <th v-for="r in filteredRules" :key="r.id" class="se-col-rule" @click="doSort(r.id)" style="cursor:pointer">
                    {{ r.isCamera ? '[CAM] ':'' }}{{ r.name.toUpperCase() }} {{ sortCol===r.id?(sortDir===1?'↑':'↓'):'↕' }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in sortedRows" :key="row.id">
                  <td class="link-text se-sticky-col">{{ row.name }}</td>
                  <td>{{ secondsToHMS(row.idleSec) }}</td>
                  <td v-for="r in filteredRules" :key="r.id">
                    <span v-if="row.ruleCounts[r.id]" class="count-badge"
                      :style="{ background: barCol(row.ruleCounts[r.id]) + '33', color: barCol(row.ruleCounts[r.id]) }">
                      {{ row.ruleCounts[r.id] }}
                    </span>
                    <span v-else class="se-zero">0</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`,
};
