/* @ts-check */
/**
 * Style injection mechanism for Next.js devtools with shadow DOM support
 * Handles caching of style elements when the nextjs-portal shadow root is not available
 */

// Global cache for style elements when shadow root is not available
if (typeof window !== 'undefined') {
  window._nextjsDevtoolsStyleCache = window._nextjsDevtoolsStyleCache || {
    pendingElements: [],
    isObserving: false,
    lastInsertedElement: null,
    cachedShadowRoot: null, // Cache the shadow root once found
  }
}

/**
 * @returns {ShadowRoot | null}
 */
function getShadowRoot() {
  const cache = window._nextjsDevtoolsStyleCache

  // Return cached shadow root if available
  if (cache.cachedShadowRoot) {
    return cache.cachedShadowRoot
  }

  // Query the DOM and cache the result if found
  const portal = document.querySelector('nextjs-portal')
  const shadowRoot = portal?.shadowRoot || null

  if (shadowRoot) {
    cache.cachedShadowRoot = shadowRoot
  }

  return shadowRoot
}

/**
 * @param {HTMLElement} element
 * @param {ShadowRoot} shadowRoot
 */
function insertElementIntoShadowRoot(element, shadowRoot) {
  const cache = window._nextjsDevtoolsStyleCache

  if (!cache.lastInsertedElement) {
    shadowRoot.insertBefore(element, shadowRoot.firstChild)
  } else if (cache.lastInsertedElement.nextSibling) {
    shadowRoot.insertBefore(element, cache.lastInsertedElement.nextSibling)
  } else {
    shadowRoot.appendChild(element)
  }

  cache.lastInsertedElement = element
}

function flushCachedElements() {
  const cache = window._nextjsDevtoolsStyleCache
  const shadowRoot = getShadowRoot()

  if (!shadowRoot) {
    return
  }

  cache.pendingElements.forEach((element) => {
    insertElementIntoShadowRoot(element, shadowRoot)
  })
  cache.pendingElements = []
}

function startObservingForPortal() {
  const cache = window._nextjsDevtoolsStyleCache

  if (cache.isObserving) {
    return
  }
  cache.isObserving = true

  // First check if the portal already exists
  const shadowRoot = getShadowRoot() // This will cache it if found
  if (shadowRoot) {
    flushCachedElements()
    return
  }

  // Set up MutationObserver to watch for the portal element
  const observer = new MutationObserver((mutations) => {
    if (mutations.length === 0) {
      return
    }

    // Check all mutations and all added nodes
    for (const mutation of mutations) {
      if (mutation.addedNodes.length === 0) continue

      for (const addedNode of mutation.addedNodes) {
        if (addedNode.nodeType !== Node.ELEMENT_NODE) continue

        const mutationNode = addedNode

        let portalNode = null
        if (
          // app router: body > script[data-nextjs-dev-overlay] > nextjs-portal
          mutationNode.tagName === 'SCRIPT' &&
          mutationNode.getAttribute('data-nextjs-dev-overlay')
        ) {
          portalNode = mutationNode.firstChild
        } else if (
          // pages router: body > nextjs-portal
          mutationNode.tagName === 'NEXTJS-PORTAL'
        ) {
          portalNode = mutationNode
        }

        if (portalNode) {
          // Wait until shadow root is available
          const checkShadowRoot = () => {
            if (getShadowRoot()) {
              flushCachedElements()
              observer.disconnect()
              cache.isObserving = false
            } else {
              // Try again after a short delay
              setTimeout(checkShadowRoot, 20)
            }
          }
          checkShadowRoot()
          return // Exit early once we find a portal
        }
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

/**
 * @param {HTMLElement} element
 */
function insertAtTop(element) {
  // Add special recognizable data prop to element
  element.setAttribute('data-nextjs-dev-tool-style', 'true')

  const shadowRoot = getShadowRoot()
  if (shadowRoot) {
    // Shadow root is available, insert directly
    insertElementIntoShadowRoot(element, shadowRoot)
  } else {
    // Shadow root not available, cache the element
    const cache = window._nextjsDevtoolsStyleCache
    cache.pendingElements.push(element)

    // Start observing for the portal if not already observing
    startObservingForPortal()
  }
}

module.exports = insertAtTop
