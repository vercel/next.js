/* eslint-disable no-unused-expressions, @typescript-eslint/no-unused-expressions */
import React from 'react'
import Router, { withRouter } from 'next/router'

export default withRouter(({ router }) => {
  React.useEffect(() => {
    Router.events.on('routeChangeComplete', () => {})
    //@ts-expect-error
    Router.events.on('event', () => {})
    Router.prefetch('/page')
    Router.push
    Router.back
    Router.reload

    router.events.on('routeChangeComplete', () => {})
    //@ts-expect-error
    router.events.on('event', () => {})
    router.prefetch('/page')
    router.push
    router.back
    router.reload
  })
  return <>{router.pathname}</>
})
