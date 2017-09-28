import 'react-hot-loader/patch'
import ReactReconciler from 'react-dom/lib/ReactReconciler'
import initOnDemandEntries from './on-demand-entries-client'
import initWebpackHMR from './webpack-hot-middleware-client'

const next = window.next = require('./')

next.default()
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
    console.error(`${err.message}\n${err.stack}`)
  })

// This is a patch to catch most of the errors throw inside React components.
const originalMountComponent = ReactReconciler.mountComponent
ReactReconciler.mountComponent = function (...args) {
  try {
    return originalMountComponent(...args)
  } catch (err) {
    if (!err.abort) {
      next.renderError(err)
      err.abort = true
    }
    throw err
  }
}
