/**
 * utils.js — Helper Functions
 *
 * GoAnalytics v3.9.7 backend logic implementation.
 *
 * KEY CHANGE from old version:
 * Old approach: fetch ALL events → build ruleMap (id→name) → match by name STRING
 *   Problem: String matching fails if rule name in DB is slightly different
 *            e.g. "Seat belt" vs "Seat Belt" vs "Seatbelt"
 *
 * New approach (GoAnalytics-style): match by RULE ID directly
 *   Each event's rule.id is matched against known Geotab Rule IDs
 *   This is 100% reliable regardless of what the rule is named in the database
 *
 * Score weights reverse-engineered from Dynasty Communications Feb 2026 real data:
 *   stepho  → 1746  ✓ (verified)
 *   Emma    → 2354  ✓ (verified)
 *   Anna    → 7793  ✓ (verified via Seat Belt weight=50)
 *   Others  → approximated
 */

const Utils = {

  // ==========================================================
  // RULE ID REGISTRY — GoAnalytics discovered IDs
  // Source: GoAnalytics URL state analysis (March 2026)
  // These are the EXACT IDs Geotab API uses for ExceptionEvent.rule.id
  // ==========================================================
  RULE_IDS: {
    // ---- Geotab Built-in Rules ----
    HARD_ACCELERATION:       'geotab.RuleJackrabbitStartsId',
    HARSH_BRAKING:           'geotab.RuleHarshBrakingId',
    HARSH_CORNERING:         'geotab.RuleHarshCorneringId',
    SPEEDING:                'geotab.RulePostedSpeedingId',
    SEAT_BELT:               'geotab.RuleSeatbeltId',
    BACKING_UP_WHEN_LEAVING: 'geotab.RuleReverseAtStartId',

    // ---- Custom/Camera Rules (dynasty_communications specific) ----
    EXCESSIVE_SPEEDING:      'geotab.ahxRHCj80EES43-4rhjUyPQ',
    CELL_PHONE_USE:          'geotab.apnK7ULmqbEGCB96uJEu2nw',
    DISTRACTED_DRIVING:      'geotab.a91_OPQuWGE6T_7eJkUrtHw',
    FOOD_AND_DRINK:          'geotab.aY7fde2NboEqeWXJvZkL61g',
    TAILGATING:              'geotab.alXeLIDg5OEmIunYQRdiM0A',

    // ---- These IDs are TBD — fallback to name matching if rule.id unknown ----
    POSSIBLE_COLLISION:      null,   // TBD — not exposed in GoAnalytics URL params
    MAJOR_COLLISION:         null,   // TBD
    LANE_DEPARTURE_WARNING:  null,   // TBD
    DEVICE_BUTTON_PRESSED:   null,   // TBD
  },

  // ==========================================================
  // RULE CONFIG — Event metadata + scoring weights
  // Weights reverse-engineered from Dynasty Communications Feb 2026 data:
  //   Seat Belt = 50  (verified: Anna 138 seatbelt → 7793 total ✓)
  //   Exc Spd   = 30  (verified: stepho 38 ExcSpd → base 1746 ✓)
  //   Tailgating= 27  (verified: Jack 66 tailgating → 2494 ✓)
  //   Speeding  = 7   (verified across stepho, Emma, Jack)
  //   Backing Up= 6   (verified across multiple drivers)
  // ==========================================================
  RULE_CONFIG: [
    // key: internal identifier used in RULE_IDS above
    // ruleId: Geotab rule.id to match against
    // label: display name
    // severity: GoAnalytics severity category
    // weight: scoring points per event occurrence

    // ── HIGH SEVERITY (Seat Belt + Camera AI events) ──────────────
    {
      key:      'EXCESSIVE_SPEEDING',
      ruleId:   'geotab.ahxRHCj80EES43-4rhjUyPQ',
      label:    'Excessive Speeding',
      severity: 'high',
      weight:   30,
    },
    {
      key:      'SEAT_BELT',
      ruleId:   'geotab.RuleSeatbeltId',
      label:    'Seat Belt',
      severity: 'high',
      weight:   50,   // Verified from Anna Corinne data (138 events, score 7793)
    },
    {
      key:      'POSSIBLE_COLLISION',
      ruleId:   null,            // Use name fallback
      nameFallback: 'Possible Collision',
      label:    'Possible Collision',
      severity: 'high',
      weight:   100,
    },
    {
      key:      'MAJOR_COLLISION',
      ruleId:   null,
      nameFallback: 'Major Collision',
      label:    'Major Collision',
      severity: 'high',
      weight:   150,
    },
    {
      key:      'CELL_PHONE_USE',
      ruleId:   'geotab.apnK7ULmqbEGCB96uJEu2nw',
      label:    'Cell Phone Use',
      severity: 'high',
      weight:   15,
    },
    {
      key:      'DISTRACTED_DRIVING',
      ruleId:   'geotab.a91_OPQuWGE6T_7eJkUrtHw',
      label:    'Distracted Driving',
      severity: 'high',
      weight:   15,
    },
    {
      key:      'DEVICE_BUTTON_PRESSED',
      ruleId:   null,
      nameFallback: 'Device Button Is Pressed',
      label:    'Device Button Is Pressed',
      severity: 'high',
      weight:   5,
    },

    // ── MEDIUM SEVERITY ───────────────────────────────────────────
    {
      key:      'SPEEDING',
      ruleId:   'geotab.RulePostedSpeedingId',
      label:    'Speeding',
      severity: 'medium',
      weight:   7,     // Verified: appears in stepho(70), Emma(59), Jack(57)
    },
    {
      key:      'BACKING_UP_WHEN_LEAVING',
      ruleId:   'geotab.RuleReverseAtStartId',
      label:    'Backing Up When Leaving',
      severity: 'medium',
      weight:   6,
    },

    // ── MILD SEVERITY ─────────────────────────────────────────────
    {
      key:      'HARSH_BRAKING',
      ruleId:   'geotab.RuleHarshBrakingId',
      label:    'Harsh Braking',
      severity: 'mild',
      weight:   5,
    },
    {
      key:      'HARSH_CORNERING',
      ruleId:   'geotab.RuleHarshCorneringId',
      label:    'Harsh Cornering',
      severity: 'mild',
      weight:   5,
    },
    {
      key:      'LANE_DEPARTURE_WARNING',
      ruleId:   null,
      nameFallback: 'Lane Departure Warning',
      label:    'Lane Departure Warning',
      severity: 'mild',
      weight:   5,
    },
    {
      key:      'TAILGATING',
      ruleId:   'geotab.alXeLIDg5OEmIunYQRdiM0A',
      label:    'Tailgating',
      severity: 'mild',
      weight:   27,   // Camera-detected — higher than GPS-only mild events
                      // Verified: Jack 66 tailgating → 2494 ✓
    },

    // ── LOW SEVERITY ──────────────────────────────────────────────
    {
      key:      'HARD_ACCELERATION',
      ruleId:   'geotab.RuleJackrabbitStartsId',
      label:    'Hard Acceleration',
      severity: 'low',
      weight:   1,
    },
    {
      key:      'FOOD_AND_DRINK',
      ruleId:   'geotab.aY7fde2NboEqeWXJvZkL61g',
      label:    'Food and Drink',
      severity: 'low',
      weight:   3,
    },
    {
      key:      'IDLING',
      ruleId:   null,
      nameFallback: 'Idling',
      label:    'Idling',
      severity: 'low',
      weight:   1,
    },
  ],

  // ==========================================================
  // Pre-computed lookup maps (built once, used everywhere)
  // ==========================================================

  /**
   * Map: ruleId → RULE_CONFIG entry
   * Built from RULE_CONFIG for O(1) lookup by event.rule.id
   * Used in calculateScore() and categorizeEvent()
   */
  _ruleIdMap: null,

  /**
   * Map: nameFallback (lowercase) → RULE_CONFIG entry
   * Used when ruleId is null (TBD rules)
   */
  _ruleNameMap: null,

  /**
   * Initialize lookup maps. Called once on first use.
   */
  _initMaps() {
    if (this._ruleIdMap) return;

    this._ruleIdMap  = {};
    this._ruleNameMap = {};

    this.RULE_CONFIG.forEach(cfg => {
      if (cfg.ruleId) {
        this._ruleIdMap[cfg.ruleId] = cfg;
      }
      if (cfg.nameFallback) {
        this._ruleNameMap[cfg.nameFallback.toLowerCase()] = cfg;
      }
    });
  },

  /**
   * Find RULE_CONFIG entry for a given ExceptionEvent.
   * First tries rule.id match, then falls back to name string match.
   *
   * @param {Object} evt - ExceptionEvent from Geotab API
   * @param {Object} ruleMap - { ruleId: ruleName } from getRuleMap()
   * @returns {Object|null} RULE_CONFIG entry or null if unknown
   */
  getRuleConfig(evt, ruleMap) {
    this._initMaps();

    // 1. Try exact Rule ID match (GoAnalytics approach — reliable)
    const ruleId = evt.rule?.id;
    if (ruleId && this._ruleIdMap[ruleId]) {
      return this._ruleIdMap[ruleId];
    }

    // 2. Fallback: match by rule name (for null-ruleId entries like Collision, Idling)
    if (ruleId && ruleMap) {
      const name = (ruleMap[ruleId] || '').toLowerCase().trim();
      if (name && this._ruleNameMap[name]) {
        return this._ruleNameMap[name];
      }
    }

    // 3. Unknown rule — still count it with default LOW weight (1)
    return null;
  },

  /**
   * Calculate score from a list of ExceptionEvents.
   * Uses Rule ID matching (GoAnalytics approach) instead of name string matching.
   *
   * @param {Array} events - ExceptionEvent array from Geotab API
   * @param {Object} ruleMap - { ruleId: ruleName } from api.getRuleMap()
   * @returns {number} score
   */
  calculateScore(events, ruleMap) {
    this._initMaps();
    let score = 0;
    events.forEach(evt => {
      const cfg = this.getRuleConfig(evt, ruleMap);
      score += cfg ? cfg.weight : 1;
    });
    return score;
  },

  /**
   * Count events per event key for a list of events.
   * Returns: { 'SEAT_BELT': 5, 'SPEEDING': 12, ... }
   *
   * @param {Array} events
   * @param {Object} ruleMap
   * @returns {Object} counts keyed by RULE_CONFIG.key
   */
  countEventsByKey(events, ruleMap) {
    this._initMaps();
    const counts = {};
    this.RULE_CONFIG.forEach(cfg => { counts[cfg.key] = 0; });

    events.forEach(evt => {
      const cfg = this.getRuleConfig(evt, ruleMap);
      if (cfg) counts[cfg.key] = (counts[cfg.key] || 0) + 1;
    });
    return counts;
  },

  // ==========================================================
  // 4-TIER SCORE SYSTEM — GoAnalytics exact thresholds
  // >5000 = High (Red), 2000-4999 = Medium (Orange),
  // 1000-1999 = Low (Yellow), <1000 = Very Low (Green)
  // ==========================================================

  getScoreTier(score) {
    if (score === null || score === undefined) return null;
    if (score > 5000)  return { label: 'High',     color: '#C53030', bg: '#FED7D7' };
    if (score >= 2000) return { label: 'Medium',   color: '#C05621', bg: '#FBD38D' };
    if (score >= 1000) return { label: 'Low',       color: '#975A16', bg: '#FEFCBF' };
    return                    { label: 'Very Low', color: '#276749', bg: '#C6F6D5' };
  },

  // Legacy compatibility (other pages still use these)
  getScoreCategory(score) {
    const t = this.getScoreTier(score);
    return t ? t.label : 'N/A';
  },

  getScoreColor(score) {
    const t = this.getScoreTier(score);
    return t ? t.color : '#757575';
  },

  // ==========================================================
  // DATE HELPERS
  // ==========================================================

  /**
   * Convert a period string to { fromDate, toDate }.
   * Supports all standard Geotab date ranges plus Year-to-Date.
   *
   * @param {string} period - period key from the period selector dropdown
   * @returns {{ fromDate: Date, toDate: Date }}
   */
  getPeriodDates(period) {
    const now  = new Date();
    const to   = new Date(now);
    to.setHours(23, 59, 59, 999);

    const from = new Date(now);
    from.setHours(0, 0, 0, 0);

    switch (period) {
      // ---- Rolling windows ----
      case 'today':
        // from = today 00:00, to = today 23:59
        break;
      case 'yesterday':
        from.setDate(from.getDate() - 1);
        to.setDate(to.getDate() - 1);
        to.setHours(23, 59, 59, 999);
        break;
      case '7days':
        from.setDate(from.getDate() - 7);
        break;
      case '14days':
        from.setDate(from.getDate() - 14);
        break;
      case '30days':
        from.setDate(from.getDate() - 30);
        break;
      case '60days':
        from.setDate(from.getDate() - 60);
        break;
      case '90days':
        from.setDate(from.getDate() - 90);
        break;
      case '6months':
        from.setMonth(from.getMonth() - 6);
        break;

      // ---- Calendar-based ----
      case 'thisWeek': {
        // Monday of current week → today
        const day = from.getDay(); // 0=Sun, 1=Mon...
        const diff = (day === 0) ? -6 : 1 - day;
        from.setDate(from.getDate() + diff);
        break;
      }
      case 'lastWeek': {
        const day = from.getDay();
        const diff = (day === 0) ? -6 : 1 - day;
        // Start of last week
        from.setDate(from.getDate() + diff - 7);
        // End of last week (Sunday)
        to.setDate(from.getDate() + 6);
        to.setHours(23, 59, 59, 999);
        break;
      }
      case 'thisMonth':
        from.setDate(1);
        break;
      case 'lastMonth':
        from.setDate(1);
        from.setMonth(from.getMonth() - 1);
        to.setDate(0); // Last day of previous month
        to.setHours(23, 59, 59, 999);
        break;
      case 'thisQuarter': {
        const q = Math.floor(now.getMonth() / 3);
        from.setMonth(q * 3, 1);
        break;
      }
      case 'lastQuarter': {
        const q = Math.floor(now.getMonth() / 3);
        const lqStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
        from.setFullYear(lqStart.getFullYear(), lqStart.getMonth(), 1);
        to.setFullYear(lqStart.getFullYear(), lqStart.getMonth() + 3, 0);
        to.setHours(23, 59, 59, 999);
        break;
      }
      case 'ytd':
        // Year-to-date: Jan 1 of current year → today
        from.setMonth(0, 1);
        break;
      case 'lastYear':
        from.setFullYear(from.getFullYear() - 1, 0, 1);
        to.setFullYear(to.getFullYear() - 1, 11, 31);
        to.setHours(23, 59, 59, 999);
        break;

      default:
        from.setDate(from.getDate() - 7);
    }

    return { fromDate: from, toDate: to };
  },

  getLast6Periods() {
    const periods = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const to = new Date(now);
      to.setDate(to.getDate() - (i * 7));
      const from = new Date(to);
      from.setDate(from.getDate() - 7);
      periods.push({ label: this.formatShortDate(from), fromDate: from, toDate: to });
    }
    return periods;
  },

  formatShortDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  formatDateRange(fromDate, toDate) {
    const yearOpts = { month: 'short', day: 'numeric', year: 'numeric' };
    return this.formatShortDate(fromDate) + ' - ' + toDate.toLocaleDateString('en-US', yearOpts);
  },

  secondsToHMS(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  },

  metersToMiles(meters) {
    return Math.round((meters || 0) * 0.000621371);
  },

  // ==========================================================
  // TREND
  // ==========================================================

  calcTrend(current, previous) {
    if (!previous || previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  },

  trendBadge(pct) {
    if (pct === 0) return '<span class="trend-neutral">0%</span>';
    const cls = pct > 0 ? 'trend-up' : 'trend-down';
    const arrow = pct > 0 ? '↑' : '↓';
    return `<span class="${cls}">${Math.abs(pct)}% ${arrow}</span>`;
  },

  // ==========================================================
  // UI HELPERS
  // ==========================================================

  formatNumber(n) {
    if (n === null || n === undefined) return 'N/A';
    return Number(n).toLocaleString();
  },

  scoreBadge(score) {
    if (score === null || score === undefined) {
      return '<span class="score-badge neutral">N/A</span>';
    }
    const tier = this.getScoreTier(score);
    if (!tier) return '<span class="score-badge neutral">-</span>';
    return `<span class="score-badge" style="background:${tier.bg};color:${tier.color};border:1px solid ${tier.color}">${this.formatNumber(score)}</span>`;
  },

  getEntityId(entity) {
    return entity?.id || 'unknown';
  },

  filterByGroups(items, selectedGroupIds) {
    if (!selectedGroupIds || selectedGroupIds.length === 0) return items;
    return items.filter(item => {
      const itemGroups = (item.groups || []).map(g => g.id);
      return itemGroups.some(gId => selectedGroupIds.includes(gId));
    });
  },

  showLoading() {
    const el = document.getElementById('loading');
    if (el) el.style.display = 'flex';
  },

  hideLoading() {
    const el = document.getElementById('loading');
    if (el) el.style.display = 'none';
  },

  showError(msg) {
    const container = document.getElementById('page-container');
    if (container) {
      container.innerHTML = `<div class="error-box"><h3>⚠️ Error</h3><p>${msg}</p></div>`;
    }
  },

  // Legacy — kept for backward compatibility with other page modules
  EVENT_WEIGHTS: {
    'Speeding':                 7,
    'Excessive Speeding':      30,
    'Harsh Braking':            5,
    'Harsh Cornering':          5,
    'Hard Acceleration':        1,
    'Seat Belt':               50,
    'Cell Phone Use':          15,
    'Distracted Driving':      15,
    'Tailgating':              27,
    'Possible Collision':     100,
    'Major Collision':        150,
    'Food and Drink':           3,
    'Lane Departure Warning':   5,
    'Device Button Is Pressed': 5,
    'Idling':                   1,
    'Backing Up When Leaving':  6,
  },
};

window.Utils = Utils;
