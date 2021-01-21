import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

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
        newRouteAnnouncement = pageHeader.innerText
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
        height: '1px',
        left: '-2px',
        overflow: 'hidden',
        position: 'absolute',
        top: '0',
        width: '1px',
      }}
    >
      {routeAnnouncement}
    </div>
  )
}

export default RouteAnnouncer
