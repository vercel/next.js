import * as React from 'react'

export function useOnClickOutside(
  el: Node | null,
  cssSelectorsToExclude: string[],
  handler: ((e: MouseEvent | TouchEvent) => void) | undefined
) {
  React.useEffect(() => {
    if (el == null || handler == null) {
      return
    }

    const listener = (e: MouseEvent | TouchEvent) => {
      // Do nothing if clicking ref's element or descendent elements
      if (!el || el.contains(e.target as Element)) {
        return
      }

      if (
        // Do nothing if clicking on an element that is excluded by the CSS selector(s)
        cssSelectorsToExclude.some((cssSelector) =>
          (e.target as Element).closest(cssSelector)
        )
      ) {
        return
      }

      handler(e)
    }

    const root = el.getRootNode()
    root.addEventListener('mouseup', listener as EventListener)
    root.addEventListener('touchend', listener as EventListener, {
      passive: false,
    })
    return function () {
      root.removeEventListener('mouseup', listener as EventListener)
      root.removeEventListener('touchend', listener as EventListener)
    }
  }, [handler, el, cssSelectorsToExclude])
}
