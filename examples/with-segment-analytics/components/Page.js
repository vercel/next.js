import React from 'react'
import Router from 'next/router'
import Header from './Header'

// Track client-side page views with Segment
Router.events.on('routeChangeComplete', () => {
  window.analytics.page(window.location.pathname + window.location.search)
})

const Page = ({ children }) => (
  <div>
    <Header />
    {children}
  </div>
)

export default Page
