/**
 * settings.js — Dashboard Settings Page
 *
 * Allows users to configure which widgets appear on the Homepage dashboard.
 * Settings are persisted using Geotab's AddInData API so they survive
 * page refreshes and are stored per user in the MyGeotab database.
 *
 * AddInData is Geotab's built-in key-value store for add-ins.
 * It replaces localStorage (which is not supported in MyGeotab add-ins).
 */

const SettingsPage = {

  // AddInData key used to store settings in Geotab database
  STORAGE_KEY: 'dynalytix_dashboard_settings',

  // Widget definitions — these map to homepage widget classes/sections
  WIDGETS: [
    {
      id:          'fleetScore',
      label:       'Fleet Score',
      description: 'Score gauge, current score, median score and trend vs last period.',
      icon:        '🎯',
      required:    true,    // Always shown, cannot be disabled
    },
    {
      id:          'scoreTrend',
      label:       'Score Trend Chart',
      description: 'Bar chart showing fleet score across the last 6 weekly periods.',
      icon:        '📈',
    },
    {
      id:          'gpsOffline',
      label:       'GPS Offline',
      description: 'Count of vehicles not reporting GPS for 5 or more days.',
      icon:        '📡',
    },
    {
      id:          'cameraOffline',
      label:       'Cameras Offline',
      description: 'Count of camera-equipped vehicles offline for 5 or more days.',
      icon:        '📷',
    },
    {
      id:          'fleetPerformance',
      label:       'Fleet Performance Table',
      description: 'Groups and drivers ranked by total unsafe driving points.',
      icon:        '📊',
    },
    {
      id:          'insights',
      label:       'Insights',
      description: 'Rule-based analysis highlighting top risk drivers and events.',
      icon:        '✨',
    },
    {
      id:          'coachingSnapshot',
      label:       'Coaching Snapshot',
      description: 'Bar chart showing coaching sessions and views across last 6 periods.',
      icon:        '🎓',
    },
    {
      id:          'eventPerformance',
      label:       'Event Performance',
      description: 'Top exception events compared to the previous period with trend.',
      icon:        '⚡',
    },
  ],

  // Default settings — all widgets on by default
  DEFAULTS: {
    fleetScore:       true,
    scoreTrend:       true,
    gpsOffline:       true,
    cameraOffline:    true,
    fleetPerformance: true,
    insights:         true,
    coachingSnapshot: true,
    eventPerformance: true,
  },

  // In-memory settings cache (loaded from AddInData on page open)
  _settings: null,

  // ============================================================
  // RENDER
  // ============================================================
  async render(container, { api }) {
    container.innerHTML = this._buildLoadingHTML();

    // Load settings from Geotab AddInData
    this._settings = await this._loadSettings(api);

    container.innerHTML = this._buildHTML(this._settings);
    this._attachListeners(container, api);
  },

  // ============================================================
  // HTML BUILDER
  // ============================================================
  _buildHTML(settings) {
    const widgetCards = this.WIDGETS.map(w => {
      const isOn      = w.required ? true : (settings[w.id] !== false);
      const isDisabled = w.required;

      return `
        <div class="settings-widget-card ${isOn ? 'settings-widget-on' : 'settings-widget-off'}">
          <div class="settings-widget-icon">${w.icon}</div>
          <div class="settings-widget-info">
            <div class="settings-widget-label">
              ${w.label}
              ${w.required ? '<span class="settings-required-badge">Always On</span>' : ''}
            </div>
            <div class="settings-widget-desc">${w.description}</div>
          </div>
          <label class="settings-toggle ${isDisabled ? 'settings-toggle-disabled' : ''}">
            <input
              type="checkbox"
              class="settings-widget-toggle"
              data-widget="${w.id}"
              ${isOn ? 'checked' : ''}
              ${isDisabled ? 'disabled' : ''}
            />
            <span class="settings-toggle-track"></span>
          </label>
        </div>`;
    }).join('');

    return `
      <div class="settings-page">

        <div class="settings-header-card card">
          <div class="settings-header-icon">⚙️</div>
          <div>
            <h2 class="settings-title">Dashboard Settings</h2>
            <p class="settings-subtitle">
              Choose which widgets appear on your Homepage dashboard.
              Changes are saved automatically to your MyGeotab profile.
            </p>
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
          <p class="settings-hint">
            Toggle widgets on or off. Your homepage will update the next time you visit it.
          </p>
          <div class="settings-widget-list">
            ${widgetCards}
          </div>
        </div>

        <div class="settings-footer">
          <div class="settings-save-status" id="save-status"></div>
          <button class="settings-btn-primary" id="btn-save-settings">
            💾 Save Settings
          </button>
          <button class="settings-btn-secondary" id="btn-reset-defaults">
            Reset to Defaults
          </button>
        </div>

      </div>`;
  },

  _buildLoadingHTML() {
    return `
      <div class="dyn-loading">
        <div class="dyn-spinner"></div>
        <p>Loading settings...</p>
      </div>`;
  },

  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  _attachListeners(container, api) {

    // Individual toggle — update card style on change
    container.querySelectorAll('.settings-widget-toggle').forEach(toggle => {
      toggle.addEventListener('change', () => {
        const card = toggle.closest('.settings-widget-card');
        if (card) {
          card.classList.toggle('settings-widget-on',  toggle.checked);
          card.classList.toggle('settings-widget-off', !toggle.checked);
        }
        this._showUnsaved(container);
      });
    });

    // Enable All
    const enableAll = container.querySelector('#btn-enable-all');
    if (enableAll) {
      enableAll.addEventListener('click', () => {
        container.querySelectorAll('.settings-widget-toggle:not(:disabled)').forEach(t => {
          t.checked = true;
          const card = t.closest('.settings-widget-card');
          if (card) { card.classList.add('settings-widget-on'); card.classList.remove('settings-widget-off'); }
        });
        this._showUnsaved(container);
      });
    }

    // Disable All (required widgets remain on)
    const disableAll = container.querySelector('#btn-disable-all');
    if (disableAll) {
      disableAll.addEventListener('click', () => {
        container.querySelectorAll('.settings-widget-toggle:not(:disabled)').forEach(t => {
          t.checked = false;
          const card = t.closest('.settings-widget-card');
          if (card) { card.classList.remove('settings-widget-on'); card.classList.add('settings-widget-off'); }
        });
        this._showUnsaved(container);
      });
    }

    // Save
    const saveBtn = container.querySelector('#btn-save-settings');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ Saving...';

        const newSettings = this._collectSettings(container);
        const success     = await this._saveSettings(api, newSettings);

        if (success) {
          this._settings = newSettings;
          // Update global settings reference
          if (window.DynSettings) window.DynSettings = newSettings;
          this._showSaved(container);
        } else {
          this._showError(container);
        }

        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save Settings';
      });
    }

    // Reset to defaults
    const resetBtn = container.querySelector('#btn-reset-defaults');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        container.querySelectorAll('.settings-widget-toggle').forEach(t => {
          const widgetId = t.getAttribute('data-widget');
          const def = this.DEFAULTS[widgetId] !== false;
          if (!t.disabled) {
            t.checked = def;
            const card = t.closest('.settings-widget-card');
            if (card) {
              card.classList.toggle('settings-widget-on',  def);
              card.classList.toggle('settings-widget-off', !def);
            }
          }
        });
        this._showUnsaved(container);
      });
    }
  },

  // ============================================================
  // COLLECT CURRENT TOGGLE STATES FROM DOM
  // ============================================================
  _collectSettings(container) {
    const settings = { ...this.DEFAULTS };
    container.querySelectorAll('.settings-widget-toggle').forEach(t => {
      const widgetId = t.getAttribute('data-widget');
      if (widgetId) settings[widgetId] = t.checked;
    });
    return settings;
  },

  // ============================================================
  // STATUS MESSAGES
  // ============================================================
  _showUnsaved(container) {
    const el = container.querySelector('#save-status');
    if (el) { el.textContent = '● Unsaved changes'; el.className = 'settings-save-status settings-status-unsaved'; }
  },

  _showSaved(container) {
    const el = container.querySelector('#save-status');
    if (el) { el.textContent = '✓ Settings saved'; el.className = 'settings-save-status settings-status-saved'; }
  },

  _showError(container) {
    const el = container.querySelector('#save-status');
    if (el) { el.textContent = '✗ Save failed — please try again'; el.className = 'settings-save-status settings-status-error'; }
  },

  // ============================================================
  // ADDIND ATA PERSISTENCE — Geotab's built-in key-value store
  // ============================================================

  /**
   * Load settings from Geotab AddInData.
   * Falls back to defaults if no settings found.
   */
  async _loadSettings(api) {
    try {
      const results = await api.call('Get', {
        typeName: 'AddInData',
        search:   { addInId: 'dynalytix', keys: [this.STORAGE_KEY] }
      });

      if (results && results.length > 0 && results[0].value) {
        const parsed = JSON.parse(results[0].value);
        // Merge with defaults so new widgets appear enabled by default
        return { ...this.DEFAULTS, ...parsed };
      }
    } catch (err) {
      console.warn('[Settings] Could not load settings from AddInData:', err.message);
    }

    return { ...this.DEFAULTS };
  },

  /**
   * Save settings to Geotab AddInData.
   * Uses Add if new, Set if existing record found.
   */
  async _saveSettings(api, settings) {
    try {
      const value = JSON.stringify(settings);

      // Check if record already exists
      const existing = await api.call('Get', {
        typeName: 'AddInData',
        search:   { addInId: 'dynalytix', keys: [this.STORAGE_KEY] }
      });

      if (existing && existing.length > 0) {
        // Update existing record
        await api.call('Set', {
          typeName: 'AddInData',
          entity:   { id: existing[0].id, addInId: 'dynalytix', key: this.STORAGE_KEY, value }
        });
      } else {
        // Create new record
        await api.call('Add', {
          typeName: 'AddInData',
          entity:   { addInId: 'dynalytix', key: this.STORAGE_KEY, value }
        });
      }

      // Update global settings so Homepage reflects changes immediately
      window.DynSettings = settings;
      console.log('[Settings] Saved successfully:', settings);
      return true;

    } catch (err) {
      console.error('[Settings] Save failed:', err.message);
      return false;
    }
  },

  // ============================================================
  // STATIC LOADER — called by App and HomepagePage
  // Loads settings without rendering the page
  // ============================================================
  async loadSettingsOnly(api) {
    const settings = await this._loadSettings(api);
    window.DynSettings = settings;
    return settings;
  },
};

window.SettingsPage = SettingsPage;
