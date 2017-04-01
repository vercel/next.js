import evalScript from '../lib/eval-script'
import ReactReconciler from 'react-dom/lib/ReactReconciler'

const { __NEXT_DATA__: { errorComponent } } = window
const ErrorComponent = evalScript(errorComponent).default

require('react-hot-loader/patch')

const next = window.next = require('./')

const emitter = next.default()

// This is a patch to catch most of the errors throw inside React components.
const originalMountComponent = ReactReconciler.mountComponent
ReactReconciler.mountComponent = function (...args) {
  try {
    return originalMountComponent(...args)
  } catch (err) {
    next.renderError(err)
    err.abort = true
    throw err
  }
}

let lastScroll

emitter.on('before-reactdom-render', ({ Component }) => {
  // Remember scroll when ErrorComponent is being rendered to later restore it
  if (!lastScroll && Component === ErrorComponent) {
    const { pageXOffset, pageYOffset } = window
    lastScroll = {
      x: pageXOffset,
      y: pageYOffset
    }
  }
})

emitter.on('after-reactdom-render', ({ Component }) => {
  if (lastScroll && Component !== ErrorComponent) {
    // Restore scroll after ErrorComponent was replaced with a page component by HMR
    const { x, y } = lastScroll
    window.scroll(x, y)
    lastScroll = null
  }
})
