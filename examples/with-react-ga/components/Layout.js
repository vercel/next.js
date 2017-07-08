import React from 'react'
import Router from 'next/router'
import { initGA, logPageView } from '../utils/analytics'

Router.onRouteChangeComplete = (url) => {
  logPageView()
}

export default class Layout extends React.Component {
  componentDidMount () {
    if (!window.GA_INITIALIZED) {
      initGA()
      window.GA_INITIALIZED = true
    }
    logPageView()
  }
  render () {
    return (
      <div>
        {this.props.children}
      </div>
    )
  }
}
