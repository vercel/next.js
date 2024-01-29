import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FlightRouterState } from '../../server/app-render/types'

const ANNOUNCER_TYPE = 'next-route-announcer'
const ANNOUNCER_ID = '__next-route-announcer__'

function getAnnouncerNode() {
  const existingAnnouncer = document.getElementsByName(ANNOUNCER_TYPE)[0]
  if (existingAnnouncer?.shadowRoot?.childNodes[0]) {
    return existingAnnouncer.shadowRoot.childNodes[0] as HTMLElement
  } else {
    const container = document.createElement(ANNOUNCER_TYPE)
    container.style.cssText = 'position:absolute'
    const announcer = document.createElement('div')
    announcer.ariaLive = 'assertive'
    announcer.id = ANNOUNCER_ID
    announcer.role = 'alert'
    announcer.style.cssText =
      'position:absolute;border:0;height:1px;margin:-1px;padding:0;width:1px;clip:rect(0 0 0 0);overflow:hidden;white-space:nowrap;word-wrap:normal'

    // Use shadow DOM here to avoid any potential CSS bleed
    const shadow = container.attachShadow({ mode: 'open' })
    shadow.appendChild(announcer)
    document.body.appendChild(container)
    return announcer
  }
}

export function AppRouterAnnouncer({ tree }: { tree: FlightRouterState }) {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const announcer = getAnnouncerNode()
    setPortalNode(announcer)
    return () => {
      const container = document.getElementsByTagName(ANNOUNCER_TYPE)[0]
      if (container?.isConnected) {
        document.body.removeChild(container)
      }
    }
  }, [])

  const [routeAnnouncement, setRouteAnnouncement] = useState('')
  const previousTitle = useRef<string | undefined>()

  useEffect(() => {
    let currentTitle = ''
    if (document.title) {
      currentTitle = document.title
    } else {
      const pageHeader = document.querySelector('h1')
      if (pageHeader) {
        currentTitle = pageHeader.innerText || pageHeader.textContent || ''
      }
    }

    // Only announce the title change, but not for the first load because screen
    // readers do that automatically.
    if (
      previousTitle.current !== undefined &&
      previousTitle.current !== currentTitle
    ) {
      setRouteAnnouncement(currentTitle)
    }
    previousTitle.current = currentTitle
  }, [tree])

  return portalNode ? createPortal(routeAnnouncement, portalNode) : null
}
