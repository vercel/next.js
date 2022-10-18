// This wrapper function is used to safely select the best available function
// to schedule removal of the no-FOUC styles workaround. requestAnimationFrame
// is the ideal choice, but when used in iframes, there are no guarantees that
// the callback will actually be called, which could stall the promise returned
// from displayContent.
//
// See: https://www.vector-logic.com/blog/posts/on-request-animation-frame-and-embedded-iframes
const safeCallbackQueue = (callback: () => void) => {
  if (window.requestAnimationFrame && window.self === window.top) {
    window.requestAnimationFrame(callback)
  } else {
    window.setTimeout(callback)
  }
}

// This function is used to remove Next.js' no-FOUC styles workaround for using
// `style-loader` in development. It must be called before hydration, or else
// rendering won't have the correct computed values in effects.
export function displayContent(): Promise<void> {
  return new Promise((resolve) => {
    safeCallbackQueue(function () {
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
