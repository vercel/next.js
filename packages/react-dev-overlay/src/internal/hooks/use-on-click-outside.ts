import * as React from 'react'

export function useOnClickOutside(
  el: Node | null,
  handler: (e: MouseEvent | TouchEvent) => void
) {
  React.useEffect(() => {
    if (el == null) {
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
    root.addEventListener('mousedown', listener)
    root.addEventListener('touchstart', listener)
    return function() {
      root.removeEventListener('mousedown', listener)
      root.removeEventListener('touchstart', listener)
    }
  }, [handler, el])
}
