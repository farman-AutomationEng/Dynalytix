/**
 * src/pages/settings.js — Settings Page (Vue 3 Component)
 */

window.DynSettings = {
  name: 'DynSettings',
  props: { api: Object, settings: Object },

  setup(props) {
    const { ref, reactive, computed, onMounted } = Vue;

    const STORAGE_KEY = 'dynalytix_settings_v1';

    const WIDGETS = [
      { id: 'fleetScore',       label: 'Fleet Score',             desc: 'Score gauge and trend vs last period.',              required: true },
      { id: 'scoreTrend',       label: 'Score Trend Chart',       desc: 'Bar chart showing fleet score across 6 periods.' },
      { id: 'gpsOffline',       label: 'GPS Offline',             desc: 'Vehicles not reporting GPS for 5+ days.' },
      { id: 'cameraOffline',    label: 'Cameras Offline',         desc: 'Camera-equipped vehicles offline for 5+ days.' },
      { id: 'fleetPerformance', label: 'Fleet Performance Table', desc: 'Groups and drivers ranked by unsafe driving points.' },
      { id: 'insights',         label: 'Insights',                desc: 'Rule-based analysis highlighting top risk drivers.' },
      { id: 'coachingSnapshot', label: 'Coaching Snapshot',       desc: 'Coaching sessions and views across 6 periods.' },
      { id: 'eventPerformance', label: 'Event Performance',       desc: 'Top exception events compared to previous period.' },
    ];

    const DEFAULTS = {
      fleetScore: true, scoreTrend: true, gpsOffline: true,
      cameraOffline: true, fleetPerformance: true,
      insights: true, coachingSnapshot: true,
      eventPerformance: true, darkMode: false,
    };

    const current  = reactive({ ...DEFAULTS });
    const saveMsg  = ref('');
    const saveCls  = ref('');
    const saving   = ref(false);

    onMounted(() => {
      // Load from sessionStorage or props
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          Object.assign(current, { ...DEFAULTS, ...parsed });
        }
      } catch (e) {}
    });

    const applyDark = (val) => {
      document.getElementById('dyn-app')?.classList.toggle('dyn-dark', val);
      if (window.DynStore) window.DynStore.darkMode = val;
    };

    const onDarkChange = (e) => {
      current.darkMode = e.target.checked;
      applyDark(current.darkMode);
      markUnsaved();
    };

    const markUnsaved = () => {
      saveMsg.value = '● Unsaved changes';
      saveCls.value = 'settings-status-unsaved';
    };

    const enableAll = () => {
      WIDGETS.filter(w => !w.required).forEach(w => { current[w.id] = true; });
      markUnsaved();
    };

    const disableAll = () => {
      WIDGETS.filter(w => !w.required).forEach(w => { current[w.id] = false; });
      markUnsaved();
    };

    const resetDefaults = () => {
      Object.assign(current, DEFAULTS);
      applyDark(false);
      markUnsaved();
    };

    const save = async () => {
      saving.value = true;
      const value  = JSON.stringify({ ...current });

      // Always save to sessionStorage
      try { sessionStorage.setItem(STORAGE_KEY, value); } catch (e) {}

      // Update global store
      if (window.DynStore) window.DynStore.settings = { ...current };

      // Try AddInData
      try {
        const api      = props.api || GeotabAPI;
        const existing = await api.call('Get', { typeName: 'AddInData', search: { addInId: 'Dynalytix' }, resultsLimit: 50 });
        const rec      = Array.isArray(existing) ? existing.find(r => r.key === STORAGE_KEY) : null;
        if (rec) {
          await api.call('Set', { typeName: 'AddInData', entity: { id: rec.id, addInId: 'Dynalytix', key: STORAGE_KEY, value } });
        } else {
          await api.call('Add', { typeName: 'AddInData', entity: { addInId: 'Dynalytix', key: STORAGE_KEY, value } });
        }
        saveMsg.value = '✓ Saved to MyGeotab profile';
      } catch (e) {
        saveMsg.value = '✓ Saved to session';
      }

      saveCls.value = 'settings-status-saved';
      saving.value  = false;
    };

    return { WIDGETS, current, saveMsg, saveCls, saving, onDarkChange, enableAll, disableAll, resetDefaults, save, markUnsaved };
  },

  template: `
    <div class="settings-page">

      <div class="settings-header-card card">
        <div class="settings-header-icon" style="font-size:28px">⚙</div>
        <div>
          <h2 class="settings-title">Dashboard Settings</h2>
          <p class="settings-subtitle">Customize your Dynalytix dashboard. Changes are saved to your session and MyGeotab profile.</p>
        </div>
      </div>

      <!-- APPEARANCE -->
      <div class="card settings-section">
        <div class="settings-section-header">
          <span class="card-title">Appearance</span>
        </div>
        <div class="settings-widget-card" :class="current.darkMode ? 'settings-widget-on' : 'settings-widget-off'" style="margin-top:8px">
          <div class="settings-widget-info">
            <div class="settings-widget-label">Dark Mode</div>
            <div class="settings-widget-desc">Switch the entire dashboard to a dark color scheme.</div>
          </div>
          <label class="settings-toggle">
            <input type="checkbox" :checked="current.darkMode" @change="onDarkChange" />
            <span class="settings-toggle-track"></span>
          </label>
        </div>
      </div>

      <!-- HOMEPAGE WIDGETS -->
      <div class="card settings-section">
        <div class="settings-section-header">
          <span class="card-title">Homepage Widgets</span>
          <div class="settings-section-actions">
            <button class="settings-btn-secondary" @click="enableAll">Enable All</button>
            <button class="settings-btn-secondary" @click="disableAll">Disable All</button>
          </div>
        </div>
        <p class="settings-hint">Toggle widgets on or off. Changes take effect when you visit the Homepage.</p>
        <div class="settings-widget-list">
          <div v-for="w in WIDGETS" :key="w.id"
            class="settings-widget-card"
            :class="(w.required || current[w.id]) ? 'settings-widget-on' : 'settings-widget-off'">
            <div class="settings-widget-info">
              <div class="settings-widget-label">
                {{ w.label }}
                <span v-if="w.required" class="settings-required-badge">Always On</span>
              </div>
              <div class="settings-widget-desc">{{ w.desc }}</div>
            </div>
            <label class="settings-toggle" :class="{ 'settings-toggle-disabled': w.required }">
              <input type="checkbox"
                :checked="w.required ? true : current[w.id]"
                :disabled="w.required"
                @change="e => { current[w.id] = e.target.checked; markUnsaved(); }" />
              <span class="settings-toggle-track"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- FOOTER -->
      <div class="settings-footer">
        <div class="settings-save-status" :class="saveCls">{{ saveMsg }}</div>
        <button class="settings-btn-primary" @click="save" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save Settings' }}
        </button>
        <button class="settings-btn-secondary" @click="resetDefaults">Reset to Defaults</button>
      </div>

    </div>
  `,
};
