import * as React from 'react'
import { createPortal } from 'react-dom'

export type ShadowPortalProps = {
  children: React.ReactNode
  globalOverlay?: boolean
}

export const ShadowPortal = function Portal({
  children,
  globalOverlay,
}: ShadowPortalProps) {
  let mountNode = React.useRef<HTMLDivElement | null>(null)
  let portalNode = React.useRef<HTMLElement | null>(null)
  let shadowNode = React.useRef<ShadowRoot | null>(null)
  let [, forceUpdate] = React.useState<{} | undefined>()

  React.useLayoutEffect(() => {
    const ownerDocument = globalOverlay
      ? document
      : mountNode.current!.ownerDocument!
    portalNode.current = ownerDocument.createElement('nextjs-portal')
    shadowNode.current = portalNode.current.attachShadow({ mode: 'open' })
    ownerDocument.body.appendChild(portalNode.current)
    forceUpdate({})
    return () => {
      if (portalNode.current && portalNode.current.ownerDocument) {
        portalNode.current.ownerDocument.body.removeChild(portalNode.current)
      }
    }
  }, [globalOverlay])

  return shadowNode.current ? (
    createPortal(children, shadowNode.current)
  ) : globalOverlay ? null : (
    <span ref={mountNode} />
  )
}
