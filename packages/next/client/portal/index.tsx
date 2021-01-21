import * as React from 'react'
import { createPortal } from 'react-dom'

type PortalProps = {
  children: React.ReactNode
  type: string
}

export const Portal: React.FC<PortalProps> = ({ children, type }) => {
  let [isMounted, setMounted] = React.useState(false)
  let mountNode = React.useRef<HTMLDivElement | null>(null)
  let portalNode = React.useRef<HTMLElement | null>(null)
  let [, forceUpdate] = React.useState<{}>()
  React.useEffect(() => {
    setMounted(true)
  }, [])
  React.useEffect(() => {
    if (!isMounted) return
    // This ref may be null when a hot-loader replaces components on the page
    if (!mountNode.current) return
    // It's possible that the content of the portal has, itself, been portaled.
    // In that case, it's important to append to the correct document element.
    const ownerDocument = mountNode.current!.ownerDocument
    portalNode.current = ownerDocument?.createElement(type)!
    ownerDocument!.body.appendChild(portalNode.current)
    forceUpdate({})
    return () => {
      if (portalNode.current && portalNode.current.ownerDocument) {
        portalNode.current.ownerDocument.body.removeChild(portalNode.current)
      }
    }
  }, [type, forceUpdate, isMounted])

  return portalNode.current ? (
    createPortal(children, portalNode.current)
  ) : isMounted ? (
    <span ref={mountNode} />
  ) : null
}
