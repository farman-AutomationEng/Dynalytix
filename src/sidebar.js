/**
 * sidebar.js — Collapsible Hover Sidebar with Pin
 * Uses dyn- prefixed class names to avoid MyGeotab CSS conflicts
 */

(function() {
  var pinned     = false;
  var hoverTimer = null;

  function init() {
    var sidebar = document.getElementById('dyn-sidebar');
    var pinBtn  = document.getElementById('dyn-pin-btn');

    if (!sidebar) return;

    // Expand on mouse enter
    sidebar.addEventListener('mouseenter', function() {
      clearTimeout(hoverTimer);
      sidebar.classList.add('dyn-expanded');
    });

    // Collapse on mouse leave (unless pinned)
    sidebar.addEventListener('mouseleave', function() {
      hoverTimer = setTimeout(function() {
        if (!pinned) {
          sidebar.classList.remove('dyn-expanded');
        }
      }, 200);
    });

    // Toggle pin on button click
    if (pinBtn) {
      pinBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        pinned = !pinned;
        pinBtn.classList.toggle('dyn-pinned', pinned);
        pinBtn.title = pinned ? 'Unpin sidebar' : 'Pin sidebar';
        if (pinned) {
          sidebar.classList.add('dyn-expanded');
        } else {
          sidebar.classList.remove('dyn-expanded');
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
