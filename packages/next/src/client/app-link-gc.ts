export function linkGc() {
  // TODO-APP: Remove this logic when Float has GC built-in in development.
  if (process.env.NODE_ENV !== 'production') {
    const callback = (mutationList: MutationRecord[]) => {
      for (const mutation of mutationList) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (
              'tagName' in node &&
              (node as HTMLLinkElement).tagName === 'LINK'
            ) {
              const link = node as HTMLLinkElement
              if (link.dataset.precedence?.startsWith('next')) {
                const href = link.getAttribute('href')
                if (href) {
                  const [resource, version] = href.split('?v=', 2)
                  if (version) {
                    const currentOrigin = window.location.origin
                    const allLinks = [
                      ...document.querySelectorAll(
                        'link[href^="' + resource + '"]'
                      ),
                      // It's possible that the resource is a full URL or only pathname,
                      // so we need to remove the alternative href as well.
                      ...document.querySelectorAll(
                        'link[href^="' +
                          (resource.startsWith(currentOrigin)
                            ? resource.slice(currentOrigin.length)
                            : currentOrigin + resource) +
                          '"]'
                      ),
                    ] as HTMLLinkElement[]

                    for (const otherLink of allLinks) {
                      if (otherLink.dataset.precedence?.startsWith('next')) {
                        const otherHref = otherLink.getAttribute('href')
                        if (otherHref) {
                          const [, otherVersion] = otherHref.split('?v=', 2)
                          if (!otherVersion || +otherVersion < +version) {
                            // Delay the removal of the stylesheet to avoid FOUC
                            // caused by `@font-face` rules, as they seem to be
                            // a couple of ticks delayed between the old and new
                            // styles being swapped even if the font is cached.
                            setTimeout(() => {
                              otherLink.remove()
                            }, 5)
                            const preloadLink = document.querySelector(
                              `link[rel="preload"][as="style"][href="${otherHref}"]`
                            )
                            if (preloadLink) {
                              preloadLink.remove()
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Create an observer instance linked to the callback function
    const observer = new MutationObserver(callback)
    observer.observe(document.head, {
      childList: true,
    })
  }
}
