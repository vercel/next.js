import * as React from 'react'

export function useOnClickOutside(
  ref: React.RefObject<Node>,
  handler: (e: MouseEvent | TouchEvent) => void
) {
  React.useEffect(() => {
    const listener = (e: MouseEvent | TouchEvent) => {
      // Do nothing if clicking ref's element or descendent elements
      if (!ref.current || ref.current.contains(e.target as Element)) {
        return
      }

      handler(e)
    }

    document.addEventListener('mousedown', listener)
    document.addEventListener('touchstart', listener)
    return function() {
      document.removeEventListener('mousedown', listener)
      document.removeEventListener('touchstart', listener)
    }
  }, [handler, ref])
}
