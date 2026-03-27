/**
 * utils.js — Helper Functions
 * Date formatting, score calculation, color coding, UI helpers
 */

const Utils = {

  // ============================================================
  // DATE HELPERS
  // ============================================================

  getPeriodDates(period) {
    const toDate = new Date();
    toDate.setHours(23, 59, 59, 999);
    const fromDate = new Date();
    fromDate.setHours(0, 0, 0, 0);

    const days = { '7days': 7, '14days': 14, '30days': 30, '90days': 90 };
    fromDate.setDate(fromDate.getDate() - (days[period] || 7));
    return { fromDate, toDate };
  },

  getLast6Periods() {
    const periods = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const to   = new Date(now);
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
    return this.formatShortDate(fromDate) + ' – ' +
      toDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

  // ============================================================
  // SCORING
  // ============================================================

  EVENT_WEIGHTS: {
    'Speeding':                  1,
    'Excessive Speeding':        3,
    'Harsh Braking':             2,
    'Harsh Cornering':           2,
    'Hard Acceleration':         1,
    'Seat Belt':                 5,
    'Cell Phone Use':            5,
    'Distracted Driving':        4,
    'Tailgating':                3,
    'Possible Collision':        10,
    'Major Collision':           15,
    'Food and Drink':            3,
    'Lane Departure Warning':    2,
    'Device Button Is Pressed':  1,
    'Idling':                    1,
  },

  calculateScore(events, ruleMap) {
    let score = 0;
    events.forEach(evt => {
      const ruleName = ruleMap[evt.rule?.id] || '';
      score += (this.EVENT_WEIGHTS[ruleName] || 1);
    });
    return score;
  },

  getScoreCategory(score) {
    if (score < 1000) return 'Low';
    if (score < 5000) return 'Medium';
    return 'High';
  },

  getScoreColor(score) {
    if (score < 1000) return '#4CAF50';
    if (score < 5000) return '#FF9800';
    return '#F44336';
  },

  calcTrend(current, previous) {
    if (!previous || previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  },

  trendBadge(pct) {
    if (pct === 0) return '<span class="trend-neutral">—</span>';
    const cls   = pct > 0 ? 'trend-up'   : 'trend-down';
    const arrow = pct > 0 ? '↑' : '↓';
    return `<span class="${cls}">${Math.abs(pct)}% ${arrow}</span>`;
  },

  // ============================================================
  // UI HELPERS
  // ============================================================

  formatNumber(n) {
    if (n === null || n === undefined) return 'N/A';
    return Number(n).toLocaleString();
  },

  scoreBadge(score) {
    if (score === null || score === undefined || score === 0) {
      return '<span class="score-badge neutral">N/A</span>';
    }
    const color   = this.getScoreColor(score);
    const bgColor = color + '22';
    return `<span class="score-badge" style="background:${bgColor};color:${color};border:1px solid ${color}">${this.formatNumber(score)}</span>`;
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
  }
};

window.Utils = Utils;
