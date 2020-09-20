import React, { useEffect, useState } from 'react'
import Router from 'next/router'

const RouterEvents: React.FC = () => {
  const [routerEvent, setRouterEvent] = useState('')
  const [routerEventError, setRouterEventError] = useState('')

  useEffect(() => {
    Router.events.on('routeChangeStart', () =>
      setRouterEvent('routeChangeStart')
    )

    Router.events.on('routeChangeComplete', () =>
      setRouterEvent('routeChangeComplete')
    )

    Router.events.on('routeChangeError', (error) => {
      setRouterEvent('routeChangeError')

      setRouterEventError(error.message)
    })
  }, [])

  return (
    <div>
      {routerEvent && <p>{routerEvent}</p>}

      {routerEventError && <p>{routerEventError}</p>}
    </div>
  )
}

export default RouterEvents
