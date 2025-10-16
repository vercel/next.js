import * as React from 'react'

export function useOnClickOutside(
  el: Node | React.RefObject<Node | null> | null,
  cssSelectorsToExclude: string[],
  handler: ((e: MouseEvent | TouchEvent) => void) | undefined
) {
  React.useEffect(() => {
    // Support both direct nodes and ref objects
    const element = el && 'current' in el ? el.current : el
    if (element == null || handler == null) {
      return
    }

    const listener = (e: MouseEvent | TouchEvent) => {
      // Do nothing if clicking ref's element or descendent elements
      if (!element || element.contains(e.target as Element)) {
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

    const root = element.getRootNode()
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
