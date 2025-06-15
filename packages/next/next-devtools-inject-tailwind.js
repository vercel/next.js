// This code runs on the browser.
// The options.target is provided from shadow-portal.tsx file.
function insertIntoTarget(element, options) {
  var root = options.target

  if (!root) {
    var portal = [].slice
      .call(document.querySelectorAll('nextjs-portal'))
      .find((p) => p.shadowRoot.querySelector('[data-nextjs-toast]'))

    root = portal?.shadowRoot
  }

  if (!root) {
    // Don't spam the error overlay with internal message that the user can't control.
    console.log(
      '[Next.js DevTools] No shadow root found to apply Tailwind CSS. This is a bug in Next.js.'
    )
    return
  }

  // To better indicate the style tag.
  element.setAttribute('data-nextjs-tailwind-style-tag', '')
  root.insertBefore(element, root.firstChild)
}

module.exports = insertIntoTarget
