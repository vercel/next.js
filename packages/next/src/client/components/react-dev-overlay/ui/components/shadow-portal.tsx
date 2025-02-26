import * as React from 'react'
import { createPortal } from 'react-dom'
import { STORAGE_KEY_THEME } from '../../shared'

export function ShadowPortal({ children }: { children: React.ReactNode }) {
  let portalNode = React.useRef<HTMLElement | null>(null)
  let shadowNode = React.useRef<ShadowRoot | null>(null)
  let [, forceUpdate] = React.useState<{} | undefined>()

  React.useLayoutEffect(() => {
    const ownerDocument = document
    portalNode.current = ownerDocument.createElement('nextjs-portal')
    // load default color preference from localstorage
    if (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(STORAGE_KEY_THEME)
    ) {
      portalNode.current.classList.add('dark')
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
