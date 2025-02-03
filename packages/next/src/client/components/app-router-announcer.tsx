import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FlightRouterState } from '../../server/app-render/types'

const ANNOUNCER_TYPE = 'next-route-announcer'
const ANNOUNCER_ID = '__next-route-announcer__'

/**
 * Utility function to get or create the announcer node.
 * Ensures the announcer node is correctly set up in the DOM with shadow DOM isolation.
 */
function getAnnouncerNode(): HTMLElement {
  const existingAnnouncer = document.getElementsByTagName(ANNOUNCER_TYPE)[0]
  if (existingAnnouncer?.shadowRoot) {
    const announcer = existingAnnouncer.shadowRoot.querySelector(`#${ANNOUNCER_ID}`)
    if (announcer) return announcer as HTMLElement
  }

  // Create a new announcer node
  const container = document.createElement(ANNOUNCER_TYPE)
  container.style.position = 'absolute'

  const announcer = document.createElement('div')
  announcer.setAttribute('aria-live', 'assertive')
  announcer.setAttribute('role', 'alert')
  announcer.id = ANNOUNCER_ID
  announcer.style.cssText =
    'position:absolute;border:0;height:1px;margin:-1px;padding:0;width:1px;clip:rect(0 0 0 0);overflow:hidden;white-space:nowrap;word-wrap:normal'

  // Attach shadow DOM for isolation
  const shadow = container.attachShadow({ mode: 'open' })
  shadow.appendChild(announcer)
  document.body.appendChild(container)

  return announcer
}

/**
 * AppRouterAnnouncer: Provides route announcement updates for screen readers.
 * It tracks and announces route changes dynamically.
 */
export function AppRouterAnnouncer({ tree }: { tree: FlightRouterState }) {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null)
  const [routeAnnouncement, setRouteAnnouncement] = useState('')
  const previousTitle = useRef<string>('')

  // Initialize announcer node
  useEffect(() => {
    const announcer = getAnnouncerNode()
    setPortalNode(announcer)

    // Cleanup announcer node on component unmount
    return () => {
      const container = document.getElementsByTagName(ANNOUNCER_TYPE)[0]
      if (container?.isConnected) {
        document.body.removeChild(container)
      }
    }
  }, [])

  // Update the route announcement based on document title or page header
  useEffect(() => {
    let currentTitle = document.title || ''
    if (!currentTitle) {
      const pageHeader = document.querySelector('h1')
      currentTitle = pageHeader?.textContent?.trim() || ''
    }

    if (previousTitle.current && previousTitle.current !== currentTitle) {
      setRouteAnnouncement(currentTitle)
    }
    previousTitle.current = currentTitle
  }, [tree])

  return portalNode ? createPortal(routeAnnouncement, portalNode) : null
}

