// This wrapper function is used to avoid raising a Trusted Types violation.
const safeSetTimeout = (callback: () => void) => setTimeout(callback)

// This function is used to remove Next.js' no-FOUC styles workaround for using
// `style-loader` in development. It must be called before hydration, or else
// rendering won't have the correct computed values in effects.
export function displayContent(): Promise<void> {
  return new Promise((resolve) => {
    ;(window.requestAnimationFrame || safeSetTimeout)(function () {
      for (
        var x = document.querySelectorAll('[data-next-hide-fouc]'),
          i = x.length;
        i--;

      ) {
        x[i].parentNode!.removeChild(x[i])
      }
      resolve()
    })
  })
}
