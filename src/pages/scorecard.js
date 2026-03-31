/** src/pages/scorecard.js — Vue 3 Component */
window.DynScorecard = {
  name: 'DynScorecard',
  props: { api: Object, fromDate: Date, toDate: Date, period: String, groupIds: Array, settings: Object },
  setup(props) {
    const { ref, onMounted } = Vue;
    const loading = ref(true);
    const error   = ref(null);
    const content = ref(null);

    onMounted(async () => {
      const el = content.value;
      if (!el) { loading.value = false; return; }
      try {
        const mod = window['ScoredcardPage'];
        if (mod && mod.render) {
          await mod.render(el, {
            api: props.api, fromDate: props.fromDate, toDate: props.toDate,
            period: props.period, groupIds: props.groupIds, settings: props.settings,
          });
        } else {
          el.innerHTML = '<div class="coming-soon"><h2>Coming Soon</h2><p>scorecard</p></div>';
        }
      } catch (err) {
        error.value = err.message;
        console.error('[Scorecard]', err);
      } finally {
        loading.value = false;
      }
    });

    return { loading, error, content };
  },
  template: `
    <div>
      <DynLoading v-if="loading" />
      <DynError v-else-if="error" :message="error" />
      <div ref="content" v-show="!loading && !error"></div>
    </div>`,
};
