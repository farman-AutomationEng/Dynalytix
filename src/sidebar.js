/**
 * sidebar.js — Hover-to-expand + Pin sidebar
 * Default: collapsed (icons only)
 * Hover:   expand (icons + labels)
 * Pin:     lock open
 */

(function() {

  var pinned     = false;
  var hoverTimer = null;

  function init() {
    var sidebar     = document.getElementById('sidebar');
    var mainContent = document.getElementById('main-content');
    var pinBtn      = document.getElementById('pin-btn');

    if (!sidebar) return;

    // HOVER EXPAND
    sidebar.addEventListener('mouseenter', function() {
      clearTimeout(hoverTimer);
      if (!pinned) {
        sidebar.classList.add('expanded');
        if (mainContent) mainContent.classList.add('sidebar-expanded');
      }
    });

    sidebar.addEventListener('mouseleave', function() {
      if (!pinned) {
        hoverTimer = setTimeout(function() {
          sidebar.classList.remove('expanded');
          if (mainContent) mainContent.classList.remove('sidebar-expanded');
        }, 200);
      }
    });

    // PIN BUTTON
    if (pinBtn) {
      pinBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        pinned = !pinned;

        if (pinned) {
          sidebar.classList.add('expanded', 'pinned');
          if (mainContent) mainContent.classList.add('sidebar-expanded');
          pinBtn.classList.add('active');
          pinBtn.title = 'Unpin sidebar';
        } else {
          sidebar.classList.remove('pinned', 'expanded');
          if (mainContent) mainContent.classList.remove('sidebar-expanded');
          pinBtn.classList.remove('active');
          pinBtn.title = 'Pin sidebar';
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
