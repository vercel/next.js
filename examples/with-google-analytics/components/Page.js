import React from 'react'
import Router from 'next/router'
import Header from './Header'

import * as gtag from '../lib/gtag'

Router.onRouteChangeComplete = url => {
  gtag.pageview(url)
}

export default ({ children }) => (
  <div>
    <Header />
    {children}
  </div>
)
