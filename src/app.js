/**
 * app.js — Main Application Controller
 * Handles routing, navigation, global state, and Geotab SDK lifecycle.
 *
 * Key rules followed:
 *  - initialize() always calls callback() — required by Geotab SDK
 *  - focus() reloads current page (also fires on org filter change)
 *  - window.location.hash is NEVER set — only read (avoids MyGeotab routing conflict)
 *  - typeName 'Driver' is not valid — use 'User' with isDriver:true (handled in api.js)
 */

const App = {

  // ---- GLOBAL STATE ----
  state: {
    initialized:      false,
    currentPage:      'homepage',
    period:           '30days',
    fromDate:         null,
    toDate:           null,
    selectedGroupIds: [],
  },

  // ---- PAGE MODULE REGISTRY ----
  // Note: ScoredcardPage typo preserved — scorecard.js exports window.ScoredcardPage
  get pages() {
    return {
      'homepage':              typeof HomepagePage    !== 'undefined' ? HomepagePage    : null,
      'leaderboard':           typeof LeaderboardPage !== 'undefined' ? LeaderboardPage : null,
      'scored-events':         typeof ScoredEventsPage !== 'undefined'? ScoredEventsPage: null,
      'scored-events-vehicle': typeof ScoredEventsPage !== 'undefined'? ScoredEventsPage: null,
      'scorecard':             typeof ScoredcardPage  !== 'undefined' ? ScoredcardPage  : null,
      'pm':                    typeof PMPage          !== 'undefined' ? PMPage          : null,
      'compliance':            typeof CompliancePage  !== 'undefined' ? CompliancePage  : null,
      'coaching':              typeof CoachingPage    !== 'undefined' ? CoachingPage    : null,
      'settings':              typeof SettingsPage    !== 'undefined' ? SettingsPage    : null,
    };
  },

  // ---- PAGE TITLES ----
  PAGE_TITLES: {
    'homepage':              'Homepage',
    'leaderboard':           'Leaderboard',
    'scored-events':         'Scored Events',
    'scored-events-vehicle': 'Scored Events — Vehicle',
    'scorecard':             'Scorecard',
    'pm':                    'Preventative Maintenance',
    'compliance':            'Compliance & Utilization',
    'coaching':              'Coaching & Engagement',
    'settings':              'Settings',
  },

  // ---- VALID PAGE NAMES (for hash detection) ----
  KNOWN_PAGES: [
    'homepage', 'leaderboard', 'scored-events', 'scored-events-vehicle',
    'scorecard', 'pm', 'compliance', 'coaching', 'settings'
  ],

  // ============================================================
  // SETUP — called once from initialize lifecycle
  // ============================================================
  async setup(freshApi, state) {
    GeotabAPI.init(freshApi);

    // Read group filter from URL params if present
    const urlParams   = new URLSearchParams(window.location.search);
    const groupsParam = urlParams.get('groups');
    if (groupsParam) {
      try {
        this.state.selectedGroupIds = JSON.parse(decodeURIComponent(groupsParam))
          .map(g => g.id || g);
      } catch (e) {
        this.state.selectedGroupIds = [];
      }
    }

    // Pre-load dashboard settings from AddInData so Homepage is ready immediately
    if (typeof SettingsPage !== 'undefined') {
      try {
        await SettingsPage.loadSettingsOnly(GeotabAPI);
        console.log('[Dynalytix] Dashboard settings loaded');
      } catch (e) {
        console.warn('[Dynalytix] Settings load failed, using defaults');
        window.DynSettings = SettingsPage ? { ...SettingsPage.DEFAULTS } : {};
      }
    }

    this.updateDateRange();
    this.setupEventListeners();

    // Determine initial page from hash (read-only — never set hash)
    const rawHash = window.location.hash.replace('#', '');
    const hash    = this.KNOWN_PAGES.includes(rawHash) ? rawHash : 'homepage';
    this.state.currentPage = hash;
    this.updateNavActive(hash);
    this.updatePageTitle(hash);

    this.state.initialized = true;
    console.log('[Dynalytix] Setup complete — page:', hash);
  },

  // ============================================================
  // DATE RANGE
  // ============================================================
  updateDateRange() {
    const { fromDate, toDate } = Utils.getPeriodDates(this.state.period);
    this.state.fromDate = fromDate;
    this.state.toDate   = toDate;

    const display = document.getElementById('date-range-display');
    if (display) {
      display.textContent = Utils.formatDateRange(fromDate, toDate);
    }

    GeotabAPI.clearCache();
  },

  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  setupEventListeners() {
    // Period selector
    const periodSel = document.getElementById('period-selector');
    if (periodSel) {
      periodSel.value = this.state.period;
      periodSel.addEventListener('change', (e) => {
        this.state.period = e.target.value;
        this.updateDateRange();
        this.loadPage(this.state.currentPage);
      });
    }

    // Sidebar nav links
    document.querySelectorAll('.dyn-nav-item[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateTo(link.getAttribute('data-page'));
      });
    });

    // Export button
    const exportBtn = document.getElementById('btn-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportCurrentPage());
    }
  },

  // ============================================================
  // NAVIGATION
  // ============================================================
  navigateTo(pageName) {
    this.state.currentPage = pageName;
    this.updateNavActive(pageName);
    this.updatePageTitle(pageName);
    this.loadPage(pageName);
  },

  updateNavActive(pageName) {
    document.querySelectorAll('.dyn-nav-item').forEach(item => {
      item.classList.toggle('dyn-active', item.getAttribute('data-page') === pageName);
    });
  },

  updatePageTitle(pageName) {
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = this.PAGE_TITLES[pageName] || 'Dynalytix';
  },

  // ============================================================
  // PAGE LOADING
  // ============================================================
  async loadPage(pageName) {
    Utils.showLoading();

    const container = document.getElementById('page-container');
    if (!container) return;

    try {
      const pageModule = this.pages[pageName];

      if (pageModule && typeof pageModule.render === 'function') {
        // Destroy existing Chart.js instances to prevent canvas memory leaks
        if (typeof Chart !== 'undefined' && Chart.instances) {
          Object.values(Chart.instances).forEach(instance => {
            try { instance.destroy(); } catch (e) {}
          });
        }

        container.innerHTML = '';
        await pageModule.render(container, {
          api:         GeotabAPI,
          fromDate:    this.state.fromDate,
          toDate:      this.state.toDate,
          period:      this.state.period,
          groupIds:    this.state.selectedGroupIds,
          vehicleMode: pageName === 'scored-events-vehicle',
          settings:    window.DynSettings || {},
        });

      } else {
        container.innerHTML = `
          <div class="coming-soon">
            <h2>🚧 Coming Soon</h2>
            <p>Page "<strong>${pageName}</strong>" is currently under development.</p>
          </div>`;
      }
    } catch (err) {
      console.error('[Dynalytix] Page load error:', err);
      Utils.showError('Failed to load data: ' + err.message);
    } finally {
      Utils.hideLoading();
    }
  },

  async reloadCurrentPage() {
    await this.loadPage(this.state.currentPage);
  },

  // ============================================================
  // CSV EXPORT
  // ============================================================
  exportCurrentPage() {
    const tables = document.querySelectorAll('.data-table');
    if (tables.length === 0) {
      alert('No data table found to export.');
      return;
    }

    const rows = Array.from(tables[0].querySelectorAll('tr'));
    const csv  = rows.map(row =>
      Array.from(row.querySelectorAll('th,td'))
        .map(cell => '"' + cell.textContent.trim().replace(/"/g, '""') + '"')
        .join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = this.state.currentPage + '-' + new Date().toISOString().split('T')[0] + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

// ============================================================
//  MyGEOTAB ADD-IN ENTRY POINT
//  Lifecycle: initialize → focus → blur
//  CRITICAL: callback() must always be called in initialize()
// ============================================================
geotab.addin.dynalytix = function() {
  return {

    /**
     * INITIALIZE — runs once on first page load.
     * callback() is mandatory — it triggers focus() after this completes.
     */
    initialize: function(freshApi, state, callback) {
      App.setup(freshApi, state)
        .catch(err => console.error('[Dynalytix] Initialize error:', err))
        .finally(() => callback());
    },

    /**
     * FOCUS — called when UI is ready and on every org filter change.
     */
    focus: function(freshApi, state) {
      GeotabAPI.init(freshApi);
      GeotabAPI.clearCache();

      if (state && typeof state.getGroupFilter === 'function') {
        const filter = state.getGroupFilter();
        App.state.selectedGroupIds = (filter || []).map(g => g.id || g);
      }

      App.loadPage(App.state.currentPage);
    },

    /**
     * BLUR — called when user navigates away from this add-in page.
     */
    blur: function() {
      console.log('[Dynalytix] blur — user navigated away');
    }
  };
};

window.App = App;
