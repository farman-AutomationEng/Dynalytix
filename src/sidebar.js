/**
 * sidebar.js — Sidebar with Pin/Unpin
 * Default: EXPANDED (full width)
 * Pin button click: COLLAPSE to icons-only
 * Hover on collapsed: temporarily expand
 */

(function() {
  var pinned = true; // starts expanded = pinned open

  function init() {
    var sidebar = document.getElementById('dyn-sidebar');
    var pinBtn  = document.getElementById('dyn-pin-btn');

    if (!sidebar) return;

    // Start expanded (no dyn-collapsed class)
    sidebar.classList.remove('dyn-collapsed');

    if (pinBtn) {
      pinBtn.classList.add('dyn-pinned');
      pinBtn.title = 'Collapse sidebar';

      pinBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        pinned = !pinned;

        if (pinned) {
          // Pin open = expanded
          sidebar.classList.remove('dyn-collapsed');
          pinBtn.classList.add('dyn-pinned');
          pinBtn.title = 'Collapse sidebar';
        } else {
          // Unpin = collapsed (hover to peek)
          sidebar.classList.add('dyn-collapsed');
          pinBtn.classList.remove('dyn-pinned');
          pinBtn.title = 'Expand sidebar';
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
