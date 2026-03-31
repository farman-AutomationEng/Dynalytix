/**
 * src/editable-grid.js — DynEditableGrid Vue Component
 *
 * Wrap any page's widgets in <DynEditableGrid page="homepage">
 * to get drag, resize, and save functionality.
 *
 * Usage:
 *   <DynEditableGrid page="homepage" :api="api">
 *     <div class="gs-widget" gs-id="widget-score" gs-w="3" gs-h="6">
 *       <div class="gs-drag-handle card-header">Title</div>
 *       ... widget content ...
 *     </div>
 *   </DynEditableGrid>
 */

window.DynEditableGrid = {
  name: 'DynEditableGrid',
  props: {
    page:    { type: String, required: true },
    api:     { type: Object, default: null },
    columns: { type: Number, default: 12 },
  },
  emits: ['edit-start', 'edit-end'],

  setup(props, { emit }) {
    const { ref, onMounted, onBeforeUnmount, nextTick } = Vue;

    const gridRef   = ref(null);
    const isEditing = ref(false);
    const saveMsg   = ref('');

    // Start edit mode
    const startEdit = async () => {
      isEditing.value = true;
      emit('edit-start');
      await nextTick();
      if (window.DynLayoutEditor && gridRef.value) {
        window.DynLayoutEditor.init(props.page, gridRef.value);
      }
    };

    // Save and exit
    const saveLayout = async () => {
      if (window.DynLayoutEditor) {
        window.DynLayoutEditor.save(props.api || GeotabAPI);
      }
      isEditing.value = false;
      saveMsg.value   = '✓ Layout saved';
      setTimeout(() => { saveMsg.value = ''; }, 2500);
      emit('edit-end');
    };

    // Cancel without saving
    const cancelEdit = () => {
      if (window.DynLayoutEditor) {
        window.DynLayoutEditor.cancel();
      }
      isEditing.value = false;
      emit('edit-end');
      // Reload to restore previous layout
      const store = window.DynStore;
      if (store) {
        const p = store.currentPage;
        store.currentPage = '__reload__';
        setTimeout(() => { store.currentPage = p; }, 50);
      }
    };

    // Reset to default
    const resetLayout = () => {
      if (window.DynLayoutEditor) {
        window.DynLayoutEditor.reset(props.page, props.api || GeotabAPI);
      }
      isEditing.value = false;
      emit('edit-end');
    };

    onBeforeUnmount(() => {
      if (window.DynLayoutEditor?._isEditing) {
        window.DynLayoutEditor.cancel();
      }
    });

    return {
      gridRef, isEditing, saveMsg,
      startEdit, saveLayout, cancelEdit, resetLayout,
    };
  },

  template: `
    <div class="dyn-editable-wrap">

      <!-- ── EDIT TOOLBAR ── -->
      <div class="dyn-edit-toolbar" :class="{ 'dyn-edit-toolbar-active': isEditing }">

        <!-- Edit button (view mode) -->
        <button v-if="!isEditing" class="dyn-edit-btn" @click="startEdit" title="Edit layout — drag and resize widgets">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14">
            <path d="M14.7 3.3a1 1 0 0 1 1.4 1.4l-9 9-3 .6.6-3 9-9z"/>
          </svg>
          Edit Layout
        </button>

        <!-- Save / Cancel (edit mode) -->
        <template v-if="isEditing">
          <span class="dyn-edit-hint">Drag widget headers to move — drag corner to resize</span>
          <div class="dyn-edit-actions">
            <button class="dyn-edit-btn dyn-edit-reset"  @click="resetLayout">Reset Default</button>
            <button class="dyn-edit-btn dyn-edit-cancel" @click="cancelEdit">Cancel</button>
            <button class="dyn-edit-btn dyn-edit-save"   @click="saveLayout">Save Layout</button>
          </div>
        </template>

        <span v-if="saveMsg" class="dyn-edit-saved">{{ saveMsg }}</span>
      </div>

      <!-- ── GRID CONTAINER ── -->
      <div
        ref="gridRef"
        class="grid-stack dyn-gs-grid"
        :class="{ 'dyn-gs-editing': isEditing }"
      >
        <slot />
      </div>

    </div>
  `,
};
