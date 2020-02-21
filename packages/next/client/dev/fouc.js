export function displayContent(callback) {
  // This is the fallback helper that removes Next.js' no-FOUC styles when
  // CSS mode is enabled. This only really activates if you haven't created
  // _any_ styles in your application yet.
  ;(window.requestAnimationFrame || setTimeout)(function() {
    for (
      var x = document.querySelectorAll('[data-next-hide-fouc]'), i = x.length;
      i--;

    ) {
      x[i].parentNode.removeChild(x[i])
    }
    if (callback) {
      callback()
    }
  })
}
