/**
 * sidebar.js — Collapsible Hover Sidebar with Pin
 * - Default state: collapsed (icons only, 60px wide)
 * - Hover state:   expanded (icons + labels, 240px wide)
 * - Pinned state:  permanently expanded (locked open)
 */

(function() {
  var pinned     = false;
  var hoverTimer = null;

  function init() {
    var sidebar     = document.getElementById('sidebar');
    var pinBtn      = document.getElementById('sidebar-pin-btn');
    var mainContent = document.querySelector('.main-content');

    if (!sidebar) return;

    // Expand sidebar on mouse enter
    sidebar.addEventListener('mouseenter', function() {
      clearTimeout(hoverTimer);
      sidebar.classList.add('sidebar-expanded');
      if (pinned && mainContent) mainContent.classList.add('main-pinned');
    });

    // Collapse sidebar on mouse leave (unless pinned)
    sidebar.addEventListener('mouseleave', function() {
      hoverTimer = setTimeout(function() {
        if (!pinned) {
          sidebar.classList.remove('sidebar-expanded');
          if (mainContent) mainContent.classList.remove('main-pinned');
        }
      }, 200);
    });

    // Toggle pin state on button click
    if (pinBtn) {
      pinBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        pinned = !pinned;
        pinBtn.classList.toggle('pinned', pinned);
        pinBtn.title = pinned ? 'Unpin sidebar' : 'Pin sidebar';

        if (pinned) {
          sidebar.classList.add('sidebar-expanded');
          if (mainContent) mainContent.classList.add('main-pinned');
        } else {
          sidebar.classList.remove('sidebar-expanded');
          if (mainContent) mainContent.classList.remove('main-pinned');
        }
      });
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
