import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type PortalProps = {
  children: React.ReactNode
  type: string
}

export const Portal = ({ children, type }: PortalProps) => {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const element = document.createElement(type)
    document.body.appendChild(element)
    setPortalNode(element)
    return () => {
      document.body.removeChild(element)
    }
  }, [type])

  return portalNode ? createPortal(children, portalNode) : null
}
