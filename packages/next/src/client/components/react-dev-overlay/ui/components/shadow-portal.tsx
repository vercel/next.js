import * as React from 'react'
import { createPortal } from 'react-dom'
import { STORAGE_KEY_THEME } from '../../shared'

export function ShadowPortal({ children }: { children: React.ReactNode }) {
  let portalNode = React.useRef<HTMLElement | null>(null)
  let shadowNode = React.useRef<ShadowRoot | null>(null)
  let [, forceUpdate] = React.useState<{} | undefined>()

  // Don't use useLayoutEffect here, as it will cause warnings during SSR in React 18.
  // Don't use useSyncExternalStore as an SSR gate unless you verified it doesn't
  // downgrade a Transition of the initial root render to a sync render or
  // we can assure the root render is not a Transition.
  React.useEffect(() => {
    const ownerDocument = document
    portalNode.current = ownerDocument.createElement('nextjs-portal')
    // load default color preference from localstorage
    if (typeof localStorage !== 'undefined') {
      const theme = localStorage.getItem(STORAGE_KEY_THEME)
      if (theme === 'dark') {
        portalNode.current.classList.add('dark')
        portalNode.current.classList.remove('light')
      } else if (theme === 'light') {
        portalNode.current.classList.remove('dark')
        portalNode.current.classList.add('light')
      }
    }

    shadowNode.current = portalNode.current.attachShadow({ mode: 'open' })
    ownerDocument.body.appendChild(portalNode.current)
    forceUpdate({})
    return () => {
      if (portalNode.current && portalNode.current.ownerDocument) {
        portalNode.current.ownerDocument.body.removeChild(portalNode.current)
      }
    }
  }, [])

  return shadowNode.current
    ? createPortal(children, shadowNode.current as any)
    : null
}
