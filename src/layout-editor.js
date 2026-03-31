/**
 * src/layout-editor.js — Drag, Resize & Save Widget Layouts
 *
 * Uses GridStack.js (loaded via CDN) to enable:
 *  - Drag widgets anywhere on the grid
 *  - Resize widgets by dragging corner handle
 *  - Save layout per page to sessionStorage + AddInData
 *  - Reset to default layout
 *
 * Each page has its own grid key so layouts are independent.
 * Works on ALL pages that use .gs-page-grid wrapper.
 */

window.DynLayoutEditor = {

  STORAGE_PREFIX: 'dynalytix_layout_',

  // Default grid configs per page
  // x, y = grid position; w, h = grid width/height (out of 12 cols)
  DEFAULT_LAYOUTS: {
    homepage: [
      { id: 'widget-score-gauge',    x: 0,  y: 0, w: 3, h: 6 },
      { id: 'widget-score-trend',    x: 3,  y: 0, w: 6, h: 6 },
      { id: 'widget-gps-offline',    x: 9,  y: 0, w: 3, h: 3 },
      { id: 'widget-cam-offline',    x: 9,  y: 3, w: 3, h: 3 },
      { id: 'widget-fleet-perf',     x: 0,  y: 6, w: 8, h: 8 },
      { id: 'widget-insights',       x: 8,  y: 6, w: 4, h: 4 },
      { id: 'widget-coaching-snap',  x: 8,  y: 10,w: 4, h: 4 },
      { id: 'widget-event-perf',     x: 0,  y: 14,w: 12,h: 5 },
    ],
    leaderboard: [
      { id: 'widget-donut',          x: 0,  y: 0, w: 4, h: 8 },
      { id: 'widget-top5',           x: 4,  y: 0, w: 8, h: 8 },
      { id: 'widget-improved',       x: 0,  y: 8, w: 3, h: 4 },
      { id: 'widget-lowest',         x: 3,  y: 8, w: 3, h: 4 },
      { id: 'widget-top-events',     x: 6,  y: 8, w: 6, h: 4 },
      { id: 'widget-bottom5',        x: 0,  y: 12,w: 12,h: 5 },
    ],
    'scored-events': [
      { id: 'widget-event-summary',  x: 0, y: 0,  w: 12, h: 3 },
      { id: 'widget-event-tiles',    x: 0, y: 3,  w: 12, h: 5 },
      { id: 'widget-event-table',    x: 0, y: 8,  w: 12, h: 8 },
    ],
    default: [
      { id: 'widget-main-table',     x: 0, y: 0, w: 12, h: 12 },
    ],
  },

  // Active GridStack instance per page
  _grid: null,
  _currentPage: null,
  _isEditing: false,

  /**
   * Initialize GridStack on a page.
   * Called when edit mode is toggled ON.
   * @param {string} pageName
   * @param {HTMLElement} gridEl  — the .gs-page-grid container
   */
  init(pageName, gridEl) {
    if (!window.GridStack) {
      console.warn('[Layout] GridStack not loaded');
      return;
    }
    if (this._grid) {
      this._grid.destroy(false);
      this._grid = null;
    }

    this._currentPage = pageName;

    // Load saved layout or use defaults
    const savedLayout = this._load(pageName);

    // Apply saved positions to DOM elements before GridStack init
    const items = savedLayout || this.DEFAULT_LAYOUTS[pageName] || this.DEFAULT_LAYOUTS.default;

    items.forEach(item => {
      const el = gridEl.querySelector('[gs-id="' + item.id + '"]');
      if (!el) return;
      el.setAttribute('gs-x',  item.x);
      el.setAttribute('gs-y',  item.y);
      el.setAttribute('gs-w',  item.w);
      el.setAttribute('gs-h',  item.h);
    });

    // Init GridStack
    this._grid = GridStack.init({
      column:          12,
      cellHeight:      60,
      margin:          8,
      animate:         true,
      resizable:       { handles: 'se' },
      draggable:       { handle: '.gs-drag-handle' },
      disableOneColumnMode: false,
    }, gridEl);

    this._isEditing = true;
    this._addEditStyles(gridEl);

    console.log('[Layout] GridStack initialized for:', pageName);
  },

  /**
   * Save current layout and disable editing.
   */
  save(api) {
    if (!this._grid || !this._currentPage) return;

    const items = this._grid.save();
    const layout = items.map(item => ({
      id: item.el?.getAttribute('gs-id') || item.id,
      x:  item.x, y: item.y,
      w:  item.w, h: item.h,
    }));

    this._saveToStorage(this._currentPage, layout, api);
    this._exitEditMode();
  },

  /**
   * Cancel editing without saving.
   */
  cancel() {
    this._exitEditMode();
  },

  /**
   * Reset layout to default.
   */
  reset(pageName, api) {
    const key = this.STORAGE_PREFIX + pageName;
    try { sessionStorage.removeItem(key); } catch (e) {}
    if (api) {
      api.call('Get', { typeName: 'AddInData', search: { addInId: 'Dynalytix' }, resultsLimit: 50 })
        .then(results => {
          if (!Array.isArray(results)) return;
          const rec = results.find(r => r.key === key);
          if (rec) api.call('Remove', { typeName: 'AddInData', entity: { id: rec.id } }).catch(() => {});
        }).catch(() => {});
    }
    this._exitEditMode();
    // Reload page
    if (window.DynStore) {
      const p = window.DynStore.currentPage;
      window.DynStore.currentPage = '__reload__';
      setTimeout(() => { window.DynStore.currentPage = p; }, 50);
    }
  },

  // ---- Private helpers ----

  _addEditStyles(gridEl) {
    gridEl.querySelectorAll('.grid-stack-item-content').forEach(el => {
      el.style.cursor = 'default';
    });
    gridEl.querySelectorAll('.gs-drag-handle').forEach(el => {
      el.style.cursor = 'grab';
    });
  },

  _exitEditMode() {
    if (this._grid) {
      this._grid.destroy(false);
      this._grid = null;
    }
    this._isEditing = false;
  },

  _load(pageName) {
    const key = this.STORAGE_PREFIX + pageName;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  },

  _saveToStorage(pageName, layout, api) {
    const key   = this.STORAGE_PREFIX + pageName;
    const value = JSON.stringify(layout);

    // sessionStorage always
    try { sessionStorage.setItem(key, value); } catch (e) {}

    // AddInData async
    if (api) {
      api.call('Get', { typeName: 'AddInData', search: { addInId: 'Dynalytix' }, resultsLimit: 50 })
        .then(existing => {
          const rec = Array.isArray(existing) ? existing.find(r => r.key === key) : null;
          if (rec) {
            return api.call('Set', { typeName: 'AddInData', entity: { id: rec.id, addInId: 'Dynalytix', key, value } });
          } else {
            return api.call('Add', { typeName: 'AddInData', entity: { addInId: 'Dynalytix', key, value } });
          }
        })
        .then(() => console.log('[Layout] Saved to AddInData:', pageName))
        .catch(e => console.warn('[Layout] AddInData save failed:', e.message));
    }
  },

  /**
   * Load layout from storage and apply to existing DOM elements.
   * Used in view-only mode (before GridStack init).
   */
  applyLayout(pageName, gridEl) {
    const layout = this._load(pageName);
    if (!layout) return false;

    layout.forEach(item => {
      const el = gridEl.querySelector('[gs-id="' + item.id + '"]');
      if (!el) return;
      el.setAttribute('gs-x', item.x);
      el.setAttribute('gs-y', item.y);
      el.setAttribute('gs-w', item.w);
      el.setAttribute('gs-h', item.h);
    });

    return true;
  },
};
