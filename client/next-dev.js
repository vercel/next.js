import stripAnsi from 'strip-ansi'
import React from 'react'
import {polyfill} from 'react-lifecycles-compat'
import initNext, * as next from './'
import {ClientDebug} from '../lib/error-debug'
import initOnDemandEntries from './on-demand-entries-client'
import initWebpackHMR from './webpack-hot-middleware-client'
import {applySourcemaps} from './source-map-support'

window.next = next

class DevAppContainer extends React.Component {
  state = {
    error: null
  }
  static getDerivedStateFromProps () {
    return {
      error: null
    }
  }
  componentDidCatch (error) {
    this.setState({ error })
  }
  render () {
    const {error} = this.state
    if (error) {
      return <ClientDebug error={error} />
    }

    return React.Children.only(this.props.children)
  }
}

// Makes sure we can use React 16.3 lifecycles and still support older versions of React.
polyfill(DevAppContainer)

initNext({ DevAppContainer, ErrorDebugComponent: ClientDebug, applySourcemaps, stripAnsi })
  .then((emitter) => {
    initOnDemandEntries()
    initWebpackHMR()

    let lastScroll

    emitter.on('before-reactdom-render', ({ Component, ErrorComponent }) => {
      // Remember scroll when ErrorComponent is being rendered to later restore it
      if (!lastScroll && Component === ErrorComponent) {
        const { pageXOffset, pageYOffset } = window
        lastScroll = {
          x: pageXOffset,
          y: pageYOffset
        }
      }
    })

    emitter.on('after-reactdom-render', ({ Component, ErrorComponent }) => {
      if (lastScroll && Component !== ErrorComponent) {
        // Restore scroll after ErrorComponent was replaced with a page component by HMR
        const { x, y } = lastScroll
        window.scroll(x, y)
        lastScroll = null
      }
    })
  })
  .catch((err) => {
    console.error(stripAnsi(`${err.message}\n${err.stack}`))
  })
