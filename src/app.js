/**
 * app.js — Dynalytix Vue 3 Application
 *
 * Architecture:
 *  - Vue 3 Composition API (no build step — CDN global build)
 *  - Geotab SDK lifecycle: initialize → focus → blur
 *  - Global reactive store injected into all child components
 *  - Dynamic component routing via store.currentPage
 *
 * Page components are registered globally and resolved by name.
 */

const { createApp, ref, reactive, computed, provide, inject,
        onMounted, onBeforeUnmount, defineComponent, watch, nextTick } = Vue;

// ============================================================
// GLOBAL STORE — reactive state shared across all components
// ============================================================
const DynStore = reactive({
  api:            null,
  currentPage:    'homepage',
  period:         '30days',
  fromDate:       null,
  toDate:         null,
  groupIds:       [],
  settings:       {},
  darkMode:       false,
  initialized:    false,
});

// ============================================================
// PAGE TITLE MAP
// ============================================================
const PAGE_TITLES = {
  'homepage':              'Homepage',
  'leaderboard':           'Leaderboard',
  'scored-events':         'Scored Events',
  'scored-events-vehicle': 'Scored Events — Vehicle',
  'scorecard':             'Scorecard',
  'pm':                    'Preventative Maintenance',
  'compliance':            'Compliance & Utilization',
  'coaching':              'Coaching & Engagement',
  'settings':              'Settings',
};

const KNOWN_PAGES = Object.keys(PAGE_TITLES);

// ============================================================
// SIDEBAR COMPONENT
// ============================================================
const DynSidebar = defineComponent({
  name: 'DynSidebar',
  setup() {
    const store   = inject('store');
    const pinned  = ref(true);
    const expanded = ref(true);

    const navItems = [
      { page: 'homepage',  label: 'Homepage' },
      { page: 'leaderboard', label: 'Leaderboard' },
    ];
    const dashItems = [
      { page: 'scored-events',         label: 'Scored Events' },
      { page: 'scored-events-vehicle', label: 'Scored Events — Vehicle' },
    ];
    const reportItems = [
      { page: 'scorecard',   label: 'Scorecard' },
      { page: 'pm',          label: 'Preventative Maintenance' },
      { page: 'compliance',  label: 'Compliance & Utilization' },
      { page: 'coaching',    label: 'Coaching & Engagement' },
    ];

    const navigate = (page) => { store.currentPage = page; };

    const togglePin = () => {
      pinned.value  = !pinned.value;
      expanded.value = pinned.value;
    };

    const onMouseEnter = () => { if (!pinned.value) expanded.value = true;  };
    const onMouseLeave = () => { if (!pinned.value) expanded.value = false; };

    const isActive = (page) => store.currentPage === page;

    return { store, expanded, pinned, navItems, dashItems, reportItems, navigate, togglePin, onMouseEnter, onMouseLeave, isActive };
  },
  template: `
    <aside
      class="dyn-sidebar"
      :class="{ 'dyn-collapsed': !expanded }"
      @mouseenter="onMouseEnter"
      @mouseleave="onMouseLeave"
    >
      <div class="dyn-sidebar-logo">
        <img src="images/icon.svg" alt="Logo" class="dyn-logo-img" />
        <span class="dyn-logo-text">dynalytix</span>
        <button class="dyn-pin-btn" :class="{ 'dyn-pinned': pinned }" @click.stop="togglePin"
          :title="pinned ? 'Collapse sidebar' : 'Expand sidebar'"></button>
      </div>

      <nav class="dyn-sidebar-nav">
        <a v-for="item in navItems" :key="item.page"
          class="dyn-nav-item" :class="{ 'dyn-active': isActive(item.page) }"
          href="#" @click.prevent="navigate(item.page)">
          <span class="dyn-nav-label">{{ item.label }}</span>
        </a>

        <div class="dyn-nav-section">DASHBOARDS</div>
        <a v-for="item in dashItems" :key="item.page"
          class="dyn-nav-item" :class="{ 'dyn-active': isActive(item.page) }"
          href="#" @click.prevent="navigate(item.page)">
          <span class="dyn-nav-label">{{ item.label }}</span>
        </a>

        <div class="dyn-nav-section">REPORTS</div>
        <a v-for="item in reportItems" :key="item.page"
          class="dyn-nav-item" :class="{ 'dyn-active': isActive(item.page) }"
          href="#" @click.prevent="navigate(item.page)">
          <span class="dyn-nav-label">{{ item.label }}</span>
        </a>
      </nav>

      <div class="dyn-sidebar-footer">
        <a class="dyn-nav-item" :class="{ 'dyn-active': isActive('settings') }"
          href="#" @click.prevent="navigate('settings')">
          <span class="dyn-nav-label">Settings</span>
        </a>
      </div>
    </aside>
  `,
});

// ============================================================
// TOPBAR COMPONENT
// ============================================================
const DynTopbar = defineComponent({
  name: 'DynTopbar',
  setup() {
    const store = inject('store');

    const pageTitle = computed(() => PAGE_TITLES[store.currentPage] || 'Dynalytix');

    const dateDisplay = computed(() => {
      if (!store.fromDate || !store.toDate) return '';
      return Utils.formatDateRange(store.fromDate, store.toDate);
    });

    const onPeriodChange = (e) => {
      store.period = e.target.value;
      updateDateRange();
    };

    const exportPage = () => {
      const tables = document.querySelectorAll('.data-table');
      if (!tables.length) { alert('No data table found to export.'); return; }
      const rows = Array.from(tables[0].querySelectorAll('tr'));
      const csv  = rows.map(r =>
        Array.from(r.querySelectorAll('th,td'))
          .map(c => '"' + c.textContent.trim().replace(/"/g, '""') + '"').join(',')
      ).join('\n');
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = store.currentPage + '-' + new Date().toISOString().split('T')[0] + '.csv';
      a.click();
    };

    const periods = [
      { group: 'Rolling Windows', options: [
        { value: 'today',    label: 'Today' },
        { value: 'yesterday',label: 'Yesterday' },
        { value: '7days',    label: 'Last 7 Days' },
        { value: '14days',   label: 'Last 14 Days' },
        { value: '30days',   label: 'Last 30 Days' },
        { value: '60days',   label: 'Last 60 Days' },
        { value: '90days',   label: 'Last 90 Days' },
        { value: '6months',  label: 'Last 6 Months' },
      ]},
      { group: 'Calendar', options: [
        { value: 'thisWeek',     label: 'This Week' },
        { value: 'lastWeek',     label: 'Last Week' },
        { value: 'thisMonth',    label: 'This Month' },
        { value: 'lastMonth',    label: 'Last Month' },
        { value: 'thisQuarter',  label: 'This Quarter' },
        { value: 'lastQuarter',  label: 'Last Quarter' },
        { value: 'ytd',          label: 'Year to Date' },
        { value: 'lastYear',     label: 'Last Year' },
      ]},
    ];

    return { store, pageTitle, dateDisplay, onPeriodChange, exportPage, periods };
  },
  template: `
    <header class="dyn-topbar">
      <div class="dyn-topbar-title">{{ pageTitle }}</div>
      <div class="dyn-topbar-controls">
        <span class="dyn-date-display">{{ dateDisplay }}</span>
        <select class="dyn-period-select" :value="store.period" @change="onPeriodChange">
          <optgroup v-for="grp in periods" :key="grp.group" :label="grp.group">
            <option v-for="opt in grp.options" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </optgroup>
        </select>
        <button class="dyn-btn-export" @click="exportPage" title="Export CSV">Export</button>
      </div>
    </header>
  `,
});

// ============================================================
// LOADING COMPONENT
// ============================================================
const DynLoading = defineComponent({
  name: 'DynLoading',
  props: { message: { type: String, default: 'Loading data...' } },
  template: `
    <div class="dyn-loading">
      <div class="dyn-spinner"></div>
      <p>{{ message }}</p>
    </div>
  `,
});

// ============================================================
// ERROR COMPONENT
// ============================================================
const DynError = defineComponent({
  name: 'DynError',
  props: { message: String },
  template: `
    <div class="error-box">
      <h3>Error</h3>
      <p>{{ message }}</p>
    </div>
  `,
});

// ============================================================
// ROOT APP COMPONENT
// ============================================================
const RootApp = defineComponent({
  name: 'DynApp',
  components: {
    DynSidebar,
    DynTopbar,
    DynLoading,
    DynError,
    // Page components registered globally
    DynHomepage:    window.DynHomepage    || null,
    DynLeaderboard: window.DynLeaderboard || null,
    DynScoredEvents:window.DynScoredEvents|| null,
    DynScorecard:   window.DynScorecard   || null,
    DynPM:          window.DynPM          || null,
    DynCompliance:  window.DynCompliance  || null,
    DynCoaching:    window.DynCoaching    || null,
    DynSettings:    window.DynSettings    || null,
  },
  setup() {
    const store = inject('store');

    const currentComponent = computed(() => {
      const map = {
        'homepage':              'DynHomepage',
        'leaderboard':           'DynLeaderboard',
        'scored-events':         'DynScoredEvents',
        'scored-events-vehicle': 'DynScoredEvents',
        'scorecard':             'DynScorecard',
        'pm':                    'DynPM',
        'compliance':            'DynCompliance',
        'coaching':              'DynCoaching',
        'settings':              'DynSettings',
      };
      return map[store.currentPage] || null;
    });

    const currentProps = computed(() => ({
      api:         GeotabAPI,
      fromDate:    store.fromDate,
      toDate:      store.toDate,
      period:      store.period,
      groupIds:    store.groupIds,
      settings:    store.settings,
      vehicleMode: store.currentPage === 'scored-events-vehicle',
    }));

    // Re-mount page on period or group change
    const pageKey = computed(() =>
      store.currentPage + '_' + store.period + '_' + JSON.stringify(store.groupIds)
    );

    return { store, currentComponent, currentProps, pageKey };
  },
  template: `
    <DynSidebar />
    <div class="dyn-main">
      <DynTopbar />
      <div class="dyn-page-container">
        <component
          v-if="currentComponent"
          :is="currentComponent"
          :key="pageKey"
          v-bind="currentProps"
        />
        <div v-else class="coming-soon">
          <h2>Coming Soon</h2>
          <p>Page "<strong>{{ store.currentPage }}</strong>" is under development.</p>
        </div>
      </div>
    </div>
  `,
});

// ============================================================
// DATE RANGE UPDATER (shared utility)
// ============================================================
function updateDateRange() {
  const { fromDate, toDate } = Utils.getPeriodDates(DynStore.period);
  DynStore.fromDate = fromDate;
  DynStore.toDate   = toDate;
  GeotabAPI.clearCache();
}

// ============================================================
// GEOTAB SDK ENTRY POINT
// ============================================================
geotab.addin.dynalytix = function() {
  let vueApp = null;

  return {

    /**
     * INITIALIZE — runs once on first page load.
     * callback() is mandatory — triggers focus() after this.
     */
    initialize: function(freshApi, state, callback) {
      try {
        GeotabAPI.init(freshApi);

        // Set initial date range
        updateDateRange();

        // Load settings from session
        try {
          const raw = sessionStorage.getItem('dynalytix_settings_v1');
          if (raw) {
            const parsed = JSON.parse(raw);
            DynStore.settings = parsed;
            DynStore.darkMode = parsed.darkMode === true;
          }
        } catch (e) {
          console.warn('[Dynalytix] Could not load settings:', e.message);
        }

        // Create and mount Vue app
        vueApp = createApp(RootApp);

        // Provide store to all components
        vueApp.provide('store', DynStore);

        // Register page components
        const pageComponents = {
          DynHomepage:     window.DynHomepage,
          DynLeaderboard:  window.DynLeaderboard,
          DynScoredEvents: window.DynScoredEvents,
          DynScorecard:    window.DynScorecard,
          DynPM:           window.DynPM,
          DynCompliance:   window.DynCompliance,
          DynCoaching:     window.DynCoaching,
          DynSettings:     window.DynSettings,
        };

        Object.entries(pageComponents).forEach(([name, comp]) => {
          if (comp) vueApp.component(name, comp);
        });

        vueApp.component('DynLoading',      DynLoading);
        vueApp.component('DynEditableGrid', window.DynEditableGrid || {});
        vueApp.component('DynError',   DynError);

        vueApp.mount('#dyn-app');

        // Apply dark mode from settings
        if (DynStore.darkMode) {
          document.getElementById('dyn-app')?.classList.add('dyn-dark');
        }

        console.log('[Dynalytix] Vue 3 app initialized');
      } catch (err) {
        console.error('[Dynalytix] Initialize error:', err);
      } finally {
        callback();
      }
    },

    /**
     * FOCUS — fires when UI is ready and on org filter change.
     */
    focus: function(freshApi, state) {
      GeotabAPI.init(freshApi);
      GeotabAPI.clearCache();

      if (state && typeof state.getGroupFilter === 'function') {
        const filter = state.getGroupFilter();
        DynStore.groupIds = (filter || []).map(g => g.id || g);
      }

      updateDateRange();
    },

    /**
     * BLUR — user navigated away.
     */
    blur: function() {
      console.log('[Dynalytix] blur');
    },
  };
};

// Expose store globally for settings page
window.DynStore = DynStore;
window.updateDateRange = updateDateRange;
