// This code runs on the browser.
// The options.target is provided from shadow-portal.tsx file.
function insertIntoTarget(element, options) {
  var root =
    options.target ||
    document.querySelector('script[data-nextjs-dev-overlay] > nextjs-portal')
      .shadowRoot

  root.insertBefore(element, root.firstChild)
}

module.exports = insertIntoTarget
