import * as React from 'react'
import { createPortal } from 'react-dom'

type PortalProps = {
  children: React.ReactNode
  type: string
}

export const Portal: React.FC<PortalProps> = ({ children, type }) => {
  let portalNode = React.useRef<HTMLElement | null>(null)
  let [, forceUpdate] = React.useState<{}>()
  React.useEffect(() => {
    portalNode.current = document.createElement(type)
    document.body.appendChild(portalNode.current)
    forceUpdate({})
    return () => {
      if (portalNode.current) {
        document.body.removeChild(portalNode.current)
      }
    }
  }, [type])

  return portalNode.current ? createPortal(children, portalNode.current) : null
}
