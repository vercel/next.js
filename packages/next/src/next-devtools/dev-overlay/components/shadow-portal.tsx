import * as React from 'react'
import { createPortal } from 'react-dom'
import { useDevOverlayContext } from '../../dev-overlay.browser'

export function ShadowPortal({ children }: { children: React.ReactNode }) {
  const { state } = useDevOverlayContext()
  let portalNode = React.useRef<HTMLElement | null>(null)
  let shadowNode = React.useRef<ShadowRoot | null>(null)
  let [, forceUpdate] = React.useState<{} | undefined>()

  // Don't use useLayoutEffect here, as it will cause warnings during SSR in React 18.
  // Don't use useSyncExternalStore as an SSR gate unless you verified it doesn't
  // downgrade a Transition of the initial root render to a sync render or
  // we can assure the root render is not a Transition.
  React.useEffect(() => {
    const ownerDocument = document
    portalNode.current = ownerDocument.querySelector('nextjs-portal')!

    if (state.theme === 'dark') {
      portalNode.current.classList.add('dark')
      portalNode.current.classList.remove('light')
    } else if (state.theme === 'light') {
      portalNode.current.classList.add('light')
      portalNode.current.classList.remove('dark')
    } else {
      portalNode.current.classList.remove('dark')
      portalNode.current.classList.remove('light')
    }

    // We can only attach but never detach a shadow root.
    // So if this is a remount, we don't need to attach a shadow root. Only
    // on the very first, DOM-wide mount.
    // This is mostly guarding against faulty _app implementations that
    // create React Root in getInitialProps but don't clean it up like test/integration/app-tree/pages/_app.tsx
    if (portalNode.current.shadowRoot === null) {
      shadowNode.current = portalNode.current.attachShadow({ mode: 'open' })
    }
    forceUpdate({})
  }, [state.theme])

  return shadowNode.current
    ? createPortal(children, shadowNode.current as any)
    : null
}
