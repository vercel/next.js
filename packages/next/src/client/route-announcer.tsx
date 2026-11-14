import React from 'react'
import { useRouter } from './router'

const nextjsRouteAnnouncerStyles: React.CSSProperties = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  top: 0,
  width: '1px',

  // https://medium.com/@jessebeach/beware-smushed-off-screen-accessible-text-5952a4c2cbfe
  whiteSpace: 'nowrap',
  wordWrap: 'normal',
}

export const RouteAnnouncer = () => {
  const { asPath } = useRouter()
  const [routeAnnouncement, setRouteAnnouncement] = React.useState('')

  // Only announce the path change, but not for the first load because screen
  // reader will do that automatically.
  const previousRoute = React.useRef<{
    title: string
    heading: string
    asPath: string
  } | null>(null)

  // Every time the path changes, announce the new page’s title following this
  // priority: first the document title, otherwise the first h1, or if neither
  // of those changed, the pathname from the URL. This methodology is inspired
  // by Marcy Sutton’s accessible client routing user testing. More information
  // can be found here:
  // https://www.gatsbyjs.com/blog/2019-07-11-user-testing-accessible-client-routing/
  React.useEffect(
    () => {
      const title = document.title
      const pageHeader = document.querySelector('h1')
      const heading = pageHeader
        ? pageHeader.innerText || pageHeader.textContent || ''
        : ''

      const previous = previousRoute.current
      previousRoute.current = { title, heading, asPath }

      if (previous === null) {
        return
      }

      // Announce the first of these that actually changed. Falling through
      // matters when two routes share a document title (e.g. `/docs` and
      // `/docs/intro`): re-announcing the identical title is a no-op for React,
      // so nothing would reach the live region at all.
      if (title && title !== previous.title) {
        setRouteAnnouncement(title)
      } else if (heading && heading !== previous.heading) {
        setRouteAnnouncement(heading)
      } else if (asPath !== previous.asPath) {
        setRouteAnnouncement(asPath)
      }
    },
    // TODO: switch to pathname + query object of dynamic route requirements
    [asPath]
  )

  return (
    <p
      aria-live="assertive" // Make the announcement immediately.
      id="__next-route-announcer__"
      role="alert"
      style={nextjsRouteAnnouncerStyles}
    >
      {routeAnnouncement}
    </p>
  )
}

export default RouteAnnouncer
