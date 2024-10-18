import * as React from 'react'

export function useOnClickOutside(
  el: Node | null,
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

      handler(e)
    }

    const root = el.getRootNode()
    root.addEventListener('mousedown', listener as EventListener)
    root.addEventListener('touchstart', listener as EventListener, {
      passive: false,
    })
    return function () {
      root.removeEventListener('mousedown', listener as EventListener)
      root.removeEventListener('touchstart', listener as EventListener)
    }
  }, [handler, el])
}
