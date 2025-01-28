import * as React from 'react'

export function useOnClickOutside(
  el: Node | null,
  excludes: string[],
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

      // Do nothing if clicking on an element that is excluded attribute(s)
      if (excludes.some((exclude) => (e.target as Element).closest(exclude))) {
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
  }, [handler, el, excludes])
}
