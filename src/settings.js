/**
 * settings.js — Dashboard Settings Page
 *
 * Features:
 *  - Homepage widget visibility toggles
 *  - Dark mode toggle (applies immediately)
 *  - Settings persistence: AddInData (primary) → sessionStorage (fallback)
 *    sessionStorage works reliably in MyGeotab iframes
 */

const SettingsPage = {

  STORAGE_KEY: 'dynalytix_settings_v1',

  WIDGETS: [
    { id: 'fleetScore',       label: 'Fleet Score',             desc: 'Score gauge, current score, median score and trend vs last period.',           icon: '🎯', required: true },
    { id: 'scoreTrend',       label: 'Score Trend Chart',       desc: 'Bar chart showing fleet score across the last 6 weekly periods.',             icon: '📈' },
    { id: 'gpsOffline',       label: 'GPS Offline',             desc: 'Count of vehicles not reporting GPS for 5 or more days.',                     icon: '📡' },
    { id: 'cameraOffline',    label: 'Cameras Offline',         desc: 'Count of camera-equipped vehicles offline for 5 or more days.',               icon: '📷' },
    { id: 'fleetPerformance', label: 'Fleet Performance Table', desc: 'Groups and drivers ranked by total unsafe driving points.',                   icon: '📊' },
    { id: 'insights',         label: 'Insights',                desc: 'Rule-based analysis highlighting top risk drivers and events.',               icon: '✨' },
    { id: 'coachingSnapshot', label: 'Coaching Snapshot',       desc: 'Bar chart showing coaching sessions and views across last 6 periods.',        icon: '🎓' },
    { id: 'eventPerformance', label: 'Event Performance',       desc: 'Top exception events compared to the previous period with trend.',           icon: '⚡' },
  ],

  DEFAULTS: {
    fleetScore: true, scoreTrend: true, gpsOffline: true, cameraOffline: true,
    fleetPerformance: true, insights: true, coachingSnapshot: true,
    eventPerformance: true, darkMode: false,
  },

  _settings: null,

  async render(container, { api }) {
    container.innerHTML = '<div class="dyn-loading"><div class="dyn-spinner"></div><p>Loading settings...</p></div>';
    this._settings = await this._load(api);
    container.innerHTML = this._buildHTML(this._settings);
    this._attach(container, api);
  },

  _buildHTML(s) {
    const widgetCards = this.WIDGETS.map(w => {
      const isOn = w.required ? true : (s[w.id] !== false);
      return `
        <div class="settings-widget-card ${isOn ? 'settings-widget-on' : 'settings-widget-off'}">
          <div class="settings-widget-info">
            <div class="settings-widget-label">
              ${w.label}
              ${w.required ? '<span class="settings-required-badge">Always On</span>' : ''}
            </div>
            <div class="settings-widget-desc">${w.desc}</div>
          </div>
          <label class="settings-toggle ${w.required ? 'settings-toggle-disabled' : ''}">
            <input type="checkbox" class="settings-widget-toggle" data-widget="${w.id}"
              ${isOn ? 'checked' : ''} ${w.required ? 'disabled' : ''} />
            <span class="settings-toggle-track"></span>
          </label>
        </div>`;
    }).join('');

    const darkOn = s.darkMode === true;

    return `
      <div class="settings-page">

        <div class="settings-header-card card">
          <div class="settings-header-icon">⚙️</div>
          <div>
            <h2 class="settings-title">Dashboard Settings</h2>
            <p class="settings-subtitle">
              Customize your Dynalytix dashboard. Settings are saved to your session and MyGeotab profile.
            </p>
          </div>
        </div>

        <div class="card settings-section">
          <div class="settings-section-header">
            <span class="card-title">Appearance</span>
          </div>
          <div class="settings-widget-card ${darkOn ? 'settings-widget-on' : 'settings-widget-off'}" style="margin-top:8px">
            <div class="settings-widget-info">
              <div class="settings-widget-label">Dark Mode</div>
              <div class="settings-widget-desc">Switch the entire dashboard to a dark color scheme.</div>
            </div>
            <label class="settings-toggle">
              <input type="checkbox" id="toggle-dark-mode" ${darkOn ? 'checked' : ''} />
              <span class="settings-toggle-track"></span>
            </label>
          </div>
        </div>

        <div class="card settings-section">
          <div class="settings-section-header">
            <span class="card-title">Homepage Widgets</span>
            <div class="settings-section-actions">
              <button class="settings-btn-secondary" id="btn-enable-all">Enable All</button>
              <button class="settings-btn-secondary" id="btn-disable-all">Disable All</button>
            </div>
          </div>
          <p class="settings-hint">Toggle widgets on or off. Changes take effect when you visit the Homepage.</p>
          <div class="settings-widget-list">${widgetCards}</div>
        </div>

        <div class="settings-footer">
          <div class="settings-save-status" id="save-status"></div>
          <button class="settings-btn-primary" id="btn-save-settings">Save Settings</button>
          <button class="settings-btn-secondary" id="btn-reset-defaults">Reset to Defaults</button>
        </div>

      </div>`;
  },

  _attach(container, api) {

    container.querySelectorAll('.settings-widget-toggle').forEach(t => {
      t.addEventListener('change', () => {
        const card = t.closest('.settings-widget-card');
        if (card) { card.classList.toggle('settings-widget-on', t.checked); card.classList.toggle('settings-widget-off', !t.checked); }
        this._markUnsaved(container);
      });
    });

    const darkToggle = container.querySelector('#toggle-dark-mode');
    if (darkToggle) {
      darkToggle.addEventListener('change', () => {
        this._applyDarkMode(darkToggle.checked);
        const card = darkToggle.closest('.settings-widget-card');
        if (card) { card.classList.toggle('settings-widget-on', darkToggle.checked); card.classList.toggle('settings-widget-off', !darkToggle.checked); }
        this._markUnsaved(container);
      });
    }

    container.querySelector('#btn-enable-all')?.addEventListener('click', () => {
      container.querySelectorAll('.settings-widget-toggle:not(:disabled)').forEach(t => {
        t.checked = true;
        const c = t.closest('.settings-widget-card');
        if (c) { c.classList.add('settings-widget-on'); c.classList.remove('settings-widget-off'); }
      });
      this._markUnsaved(container);
    });

    container.querySelector('#btn-disable-all')?.addEventListener('click', () => {
      container.querySelectorAll('.settings-widget-toggle:not(:disabled)').forEach(t => {
        t.checked = false;
        const c = t.closest('.settings-widget-card');
        if (c) { c.classList.remove('settings-widget-on'); c.classList.add('settings-widget-off'); }
      });
      this._markUnsaved(container);
    });

    const saveBtn = container.querySelector('#btn-save-settings');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        const newSettings = this._collect(container);
        const { ok, method } = await this._save(api, newSettings);
        this._settings = newSettings;
        window.DynSettings = newSettings;
        this._showStatus(container,
          ok ? ('✓ Saved' + (method === 'AddInData' ? ' to MyGeotab profile' : ' to session')) : '✗ Save failed — please try again',
          ok ? 'settings-status-saved' : 'settings-status-error'
        );
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Settings';
      });
    }

    container.querySelector('#btn-reset-defaults')?.addEventListener('click', () => {
      container.querySelectorAll('.settings-widget-toggle').forEach(t => {
        const def = this.DEFAULTS[t.dataset.widget] !== false;
        if (!t.disabled) {
          t.checked = def;
          const c = t.closest('.settings-widget-card');
          if (c) { c.classList.toggle('settings-widget-on', def); c.classList.toggle('settings-widget-off', !def); }
        }
      });
      const dt = container.querySelector('#toggle-dark-mode');
      if (dt) { dt.checked = false; this._applyDarkMode(false); }
      this._markUnsaved(container);
    });
  },

  _collect(container) {
    const s = { ...this.DEFAULTS };
    container.querySelectorAll('.settings-widget-toggle').forEach(t => {
      if (t.dataset.widget) s[t.dataset.widget] = t.checked;
    });
    const dt = container.querySelector('#toggle-dark-mode');
    if (dt) s.darkMode = dt.checked;
    return s;
  },

  // ---- PERSISTENCE ----
  async _load(api) {
    // Try AddInData first
    try {
      const results = await api.call('Get', {
        typeName: 'AddInData',
        search:   { addInId: 'Dynalytix' },
        resultsLimit: 50,
      });
      if (Array.isArray(results) && results.length > 0) {
        const rec = results.find(r => r.key === this.STORAGE_KEY);
        if (rec && rec.value) {
          const parsed = JSON.parse(rec.value);
          this._applyDarkMode(parsed.darkMode === true);
          console.log('[Settings] Loaded from AddInData');
          return { ...this.DEFAULTS, ...parsed };
        }
      }
    } catch (e) {
      console.warn('[Settings] AddInData load failed:', e.message);
    }

    // Fallback: sessionStorage (works in MyGeotab iframes)
    try {
      const raw = sessionStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this._applyDarkMode(parsed.darkMode === true);
        console.log('[Settings] Loaded from sessionStorage');
        return { ...this.DEFAULTS, ...parsed };
      }
    } catch (e) {
      console.warn('[Settings] sessionStorage load failed:', e.message);
    }

    return { ...this.DEFAULTS };
  },

  async _save(api, settings) {
    const value = JSON.stringify(settings);

    // Always save to sessionStorage — instant and reliable
    try {
      sessionStorage.setItem(this.STORAGE_KEY, value);
    } catch (e) {
      console.warn('[Settings] sessionStorage save failed:', e.message);
    }

    // Also try AddInData for cross-session persistence
    try {
      const existing = await api.call('Get', {
        typeName: 'AddInData',
        search:   { addInId: 'Dynalytix' },
        resultsLimit: 50,
      });
      const rec = Array.isArray(existing) ? existing.find(r => r.key === this.STORAGE_KEY) : null;

      if (rec) {
        await api.call('Set', {
          typeName: 'AddInData',
          entity:   { id: rec.id, addInId: 'Dynalytix', key: this.STORAGE_KEY, value },
        });
      } else {
        await api.call('Add', {
          typeName: 'AddInData',
          entity:   { addInId: 'Dynalytix', key: this.STORAGE_KEY, value },
        });
      }
      return { ok: true, method: 'AddInData' };
    } catch (e) {
      console.warn('[Settings] AddInData save failed, kept in session:', e.message);
      return { ok: true, method: 'session' };
    }
  },

  // ---- DARK MODE ----
  _applyDarkMode(enable) {
    const app = document.getElementById('dyn-app');
    if (!app) return;
    app.classList.toggle('dyn-dark', enable);
    if (window.DynSettings) window.DynSettings.darkMode = enable;
  },

  _markUnsaved(container) { this._showStatus(container, '● Unsaved changes', 'settings-status-unsaved'); },
  _showStatus(container, msg, cls) {
    const el = container.querySelector('#save-status');
    if (el) { el.textContent = msg; el.className = 'settings-save-status ' + cls; }
  },

  async loadSettingsOnly(api) {
    const s = await this._load(api);
    window.DynSettings = s;
    this._applyDarkMode(s.darkMode === true);
    return s;
  },
};

window.SettingsPage = SettingsPage;
