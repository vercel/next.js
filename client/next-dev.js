import patch from './patch-react'
import evalScript from '../lib/eval-script'

const { __NEXT_DATA__: { errorComponent } } = window
const ErrorComponent = evalScript(errorComponent).default

// apply patch first
patch((err) => {
  console.error(err)

  Promise.resolve().then(() => {
    onError(err)
  })
})

require('react-hot-loader/patch')

const next = window.next = require('./')

next.default(onError)

function onError (err) {
  // just show the debug screen but don't render ErrorComponent
  // so that the current component doesn't lose props
  next.render({ err })
}

let lastScroll

document.addEventListener('before-reactdom-render', ({ detail: { Component } }) => {
  // Remember scroll when ErrorComponent is being rendered to later restore it
  if (!lastScroll && Component === ErrorComponent) {
    const { pageXOffset, pageYOffset } = window
    lastScroll = {
      x: pageXOffset,
      y: pageYOffset
    }
  }
})

document.addEventListener('after-reactdom-render', ({ detail: { Component } }) => {
  if (lastScroll && Component !== ErrorComponent) {
    // Restore scroll after ErrorComponent was replaced with a page component by HMR
    const { x, y } = lastScroll
    window.scroll(x, y)
    lastScroll = false
  }
})
