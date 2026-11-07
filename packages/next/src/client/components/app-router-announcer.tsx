import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FlightRouterState } from '../../shared/lib/app-router-types'

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
  const previousRoute = useRef<{
    title: string
    heading: string
    pathname: string
  } | null>(null)

  // Every time the route changes, announce the new page following this
  // priority: first the document title, otherwise the first h1, or if neither
  // of those changed, the pathname from the URL. This methodology is inspired
  // by Marcy Sutton's accessible client routing user testing. More information
  // can be found here:
  // https://www.gatsbyjs.com/blog/2019-07-11-user-testing-accessible-client-routing/
  useEffect(() => {
    const title = document.title
    const pageHeader = document.querySelector('h1')
    const heading = pageHeader
      ? pageHeader.innerText || pageHeader.textContent || ''
      : ''
    // `HistoryUpdater` writes the new URL in an insertion effect, which runs
    // before this passive effect, so `location` already reflects the route that
    // was just committed.
    const pathname = window.location.pathname

    const previous = previousRoute.current
    previousRoute.current = { title, heading, pathname }

    // Don't announce the first load, because screen readers do that
    // automatically.
    if (previous === null) {
      return
    }

    // Announce the first of these that actually changed. Falling through
    // matters when two routes share a document title (e.g. `/docs` and
    // `/docs/intro` rendered by the same layout): before, the title was the
    // only source that was ever considered, so nothing was announced at all.
    if (title && title !== previous.title) {
      setRouteAnnouncement(title)
    } else if (heading && heading !== previous.heading) {
      setRouteAnnouncement(heading)
    } else if (pathname !== previous.pathname) {
      setRouteAnnouncement(pathname)
    }
  }, [tree])

  return portalNode ? createPortal(routeAnnouncement, portalNode) : null
}
