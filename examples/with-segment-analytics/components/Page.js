import React from 'react'
import Router from 'next/router'
import Header from './Header'

// Track page views with Segment
// No need to exclude localhost as this is can be done in Google Analytics console
Router.events.on('routeChangeComplete', url => {
  if (typeof window !== 'undefined') {
    window.analytics.page(url)
  }
})

const Page = ({ children }) =>
  <div>
    <Header />
    {children}
  </div>

export default Page
