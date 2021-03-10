import React, { useEffect, useState } from 'react'
import { useRouter } from './router'

export function RouteAnnouncer() {
  const router = useRouter()
  const [routeAnnouncement, setRouteAnnouncement] = useState('')

  const { asPath } = router

  // Every time the path changes, announce the route change. The announcement will be prioritized by h1, then title
  // (from metadata), and finally if those don't exist, then the pathName that is in the URL. This methodology is
  // inspired by Marcy Sutton's accessible client routing user testing. More information can be found here:
  // https://www.gatsbyjs.com/blog/2019-07-11-user-testing-accessible-client-routing/
  useEffect(
    () => {
      let newRouteAnnouncement
      const pageHeader = document.querySelector('h1')

      if (pageHeader) {
        newRouteAnnouncement = pageHeader.innerText || pageHeader.textContent
      } else if (document.title) {
        newRouteAnnouncement = document.title
      } else {
        newRouteAnnouncement = asPath
      }

      setRouteAnnouncement(newRouteAnnouncement)
    },
    // TODO: switch to pathname + query object of dynamic route requirements
    [asPath]
  )

  return (
    <div
      aria-atomic // Always announce the entire path.
      aria-live="assertive" // Make the announcement immediately.
      role="alert"
      style={{
        border: 0,
        clip: 'rect(0 0 0 0)',
        height: '1px',
        margin: '-1px',
        overflow: 'hidden',
        padding: 0,
        position: 'absolute',
        width: '1px',

        // https://medium.com/@jessebeach/beware-smushed-off-screen-accessible-text-5952a4c2cbfe
        whiteSpace: 'nowrap',
        wordWrap: 'normal',
      }}
    >
      {routeAnnouncement}
    </div>
  )
}

export default RouteAnnouncer
