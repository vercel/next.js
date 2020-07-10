// This function is used to remove Next.js' no-FOUC styles workaround for using
// `style-loader` in development. It must be called before hydration, or else
// rendering won't have the correct computed values in effects.
export function displayContent(callback) {
  ;(window.requestAnimationFrame || setTimeout)(function () {
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
