import initNext, * as next from './'
import initOnDemandEntries from './on-demand-entries-client'
import initWebpackHMR from './webpack-hot-middleware-client'

const {
  __NEXT_DATA__: {
    assetPrefix
  }
} = window

const prefix = assetPrefix || ''
const webpackHMR = initWebpackHMR({assetPrefix: prefix})

window.next = next
initNext({ webpackHMR })
  .then((emitter) => {
    initOnDemandEntries({assetPrefix: prefix})

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
  }).catch((err) => {
    console.error('Error was not caught', err)
  })
