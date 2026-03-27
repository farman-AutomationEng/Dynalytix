/**
 * app.js — Main Application Controller
 * Routing, navigation, global state, Geotab SDK lifecycle
 *
 * FIXES:
 *  - initialize() ab callback() call karta hai (required by SDK)
 *  - focus() ab current page reload karta hai (org filter change pe bhi)
 *  - blur() cleanup karta hai
 *  - Page registry correct references use karta hai
 */

const App = {

  // ---- GLOBAL STATE ----
  state: {
    initialized: false,
    currentPage: 'homepage',
    period: '30days',
    fromDate: null,
    toDate: null,
    selectedGroupIds: [],
  },

  // ---- PAGE MODULE REGISTRY ----
  // Note: ScoredcardPage (original typo preserved — scorecard.js mein window.ScoredcardPage hai)
  get pages() {
    return {
      'homepage':              typeof HomepagePage !== 'undefined'    ? HomepagePage    : null,
      'leaderboard':           typeof LeaderboardPage !== 'undefined' ? LeaderboardPage : null,
      'scored-events':         typeof ScoredEventsPage !== 'undefined'? ScoredEventsPage: null,
      'scored-events-vehicle': typeof ScoredEventsPage !== 'undefined'? ScoredEventsPage: null,
      'scorecard':             typeof ScoredcardPage !== 'undefined'  ? ScoredcardPage  : null,
      'pm':                    typeof PMPage !== 'undefined'          ? PMPage          : null,
      'compliance':            typeof CompliancePage !== 'undefined'  ? CompliancePage  : null,
      'coaching':              typeof CoachingPage !== 'undefined'    ? CoachingPage    : null,
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
  },

  // ============================================================
  // SETUP (called once from initialize lifecycle)
  // ============================================================

  setup(freshApi, state) {
    // GeotabAPI initialize karo
    GeotabAPI.init(freshApi);

    // URL params se group filter lo
    const urlParams = new URLSearchParams(window.location.search);
    const groupsParam = urlParams.get('groups');
    if (groupsParam) {
      try {
        this.state.selectedGroupIds = JSON.parse(decodeURIComponent(groupsParam))
          .map(g => g.id || g);
      } catch (e) {
        this.state.selectedGroupIds = [];
      }
    }

    // Date range calculate karo
    this.updateDateRange();

    // Event listeners lagao
    this.setupEventListeners();

    // Pehli baar navigate karo
    // MyGeotab kabhi kabhi apna hash append karta hai (e.g. #addin-dynalytix-index)
    // Unknown hash ko homepage pe redirect karo
    const KNOWN_PAGES = ['homepage','leaderboard','scored-events','scored-events-vehicle','scorecard','pm','compliance','coaching'];
    const rawHash = window.location.hash.replace('#', '');
    const hash = KNOWN_PAGES.includes(rawHash) ? rawHash : 'homepage';
    this.state.currentPage = hash;
    window.location.hash = hash;
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
    document.querySelectorAll('.nav-item[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.getAttribute('data-page');
        this.navigateTo(page);
      });
    });

    // Browser back/forward
    window.addEventListener('hashchange', () => {
      const KNOWN_PAGES = ['homepage','leaderboard','scored-events','scored-events-vehicle','scorecard','pm','compliance','coaching'];
      const raw  = window.location.hash.replace('#', '');
      const hash = KNOWN_PAGES.includes(raw) ? raw : 'homepage';
      if (hash !== this.state.currentPage) {
        this.state.currentPage = hash;
        this.updateNavActive(hash);
        this.updatePageTitle(hash);
        this.loadPage(hash);
      }
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
    window.location.hash   = pageName;
    this.updateNavActive(pageName);
    this.updatePageTitle(pageName);
    this.loadPage(pageName);
  },

  updateNavActive(pageName) {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-page') === pageName);
    });
  },

  updatePageTitle(pageName) {
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
      titleEl.textContent = this.PAGE_TITLES[pageName] || 'Dynalytix';
    }
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
        // Chart.js instances ko destroy karo memory leak se bachne ke liye
        Chart.helpers && Chart.helpers.each && Chart.helpers.each(
          Chart.instances || [],
          (instance) => { try { instance.destroy(); } catch(e) {} }
        );

        container.innerHTML = '';
        await pageModule.render(container, {
          api:         GeotabAPI,
          fromDate:    this.state.fromDate,
          toDate:      this.state.toDate,
          period:      this.state.period,
          groupIds:    this.state.selectedGroupIds,
          vehicleMode: pageName === 'scored-events-vehicle'
        });
      } else {
        container.innerHTML = `
          <div class="coming-soon">
            <h2>🚧 Coming Soon</h2>
            <p>Page "<strong>${pageName}</strong>" is currently under development.</p>
          </div>
        `;
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
//  ⚠️ callback() zaroor call karna hai initialize mein
// ============================================================

geotab.addin.dynalytix = function() {
  return {

    /**
     * INITIALIZE — sirf ek baar chalega (page first load pe)
     * callback() call karna MANDATORY hai — iske baad focus() chalega
     */
    initialize: function(freshApi, state, callback) {
      try {
        App.setup(freshApi, state);
      } catch (err) {
        console.error('[Dynalytix] Initialize error:', err);
      } finally {
        callback(); // ← CRITICAL: yeh na hoga toh focus() nahi chalega
      }
    },

    /**
     * FOCUS — UI ready hone ke baad aur har baar jab user is page pe aaye
     * Org filter change pe bhi yahi call hota hai
     */
    focus: function(freshApi, state) {
      // API reference fresh karo (org change ke case mein)
      GeotabAPI.init(freshApi);
      GeotabAPI.clearCache();

      // Org filter se updated group IDs lo
      if (state && typeof state.getGroupFilter === 'function') {
        const filter = state.getGroupFilter();
        App.state.selectedGroupIds = (filter || []).map(g => g.id || g);
      }

      // Current page ka data reload karo
      App.loadPage(App.state.currentPage);
    },

    /**
     * BLUR — jab user dusri page pe jaye
     */
    blur: function() {
      // Future: koi cleanup ya state save karna ho toh yahan karo
      console.log('[Dynalytix] blur — page left');
    }

  };
};

window.App = App;
