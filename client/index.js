import { createElement } from 'react'
import ReactDOM from 'react-dom'
import { createRouter } from '../lib/router'
import EventEmitter from '../lib/EventEmitter'
import App from '../lib/app'
import { getURL } from '../lib/utils'
import { waitForPage } from '../lib/page-loader'
import { subscribe } from '../lib/router/router'

const {
  __NEXT_DATA__: {
    props,
    err,
    pathname,
    query,
    publicPath
  },
  location
} = window

__webpack_public_path__ = publicPath    // eslint-disable-line

const asPath = getURL()

const appContainer = document.getElementById('__next')
const errorContainer = document.getElementById('__next-error')

let lastAppProps
export let router
export let ErrorComponent

export const emitter = new EventEmitter()

export default () => {
  return Promise.all([
    waitForPage('/_error'),
    waitForPage(pathname).catch(console.error)
  ])
    .then(([_ErrorComponent, Component]) => {
      ErrorComponent = _ErrorComponent
      Component = Component || ErrorComponent

      router = createRouter(pathname, query, asPath, {
        Component,
        ErrorComponent,
        err
      })

      subscribe(({ Component, props, hash, err }) => {
        render({ Component, props, err, hash, emitter })
      })

      const hash = location.hash.substring(1)
      render({ Component, props, hash, err, emitter })

      return emitter
    })
}

export function render ({ Component, props, hash, err, emitter: emitterProp = emitter }) {
  // There are some errors we should ignore.
  // Next.js rendering logic knows how to handle them.
  // These are specially 404 errors
  if (err && !err.ignore) {
    return renderError(err)
  }

  let loadProps
  if (!props && Component &&
  Component !== ErrorComponent &&
  lastAppProps.Component === ErrorComponent) {
  // fetch props if ErrorComponent was replaced with a page component by HMR
    const { pathname, query, asPath } = router
    loadProps = Component.getInitialProps({ err, pathname, query, asPath })
  } else {
    loadProps = Promise.resolve(props)
  }

  return loadProps
    .then((props) => {
      Component = Component || lastAppProps.Component
      props = props || lastAppProps.props

      const appProps = { Component, props, hash, err, router }
      // lastAppProps has to be set before ReactDom.render to account for ReactDom throwing an error.
      lastAppProps = appProps

      emitterProp.emit('before-reactdom-render', { Component, ErrorComponent, appProps })

      // We need to clear any existing runtime error messages
      ReactDOM.unmountComponentAtNode(errorContainer)
      errorContainer.innerHTML = ''

      renderReactElement(createElement(App, appProps), appContainer)

      emitterProp.emit('after-reactdom-render', { Component, ErrorComponent, appProps })
    }).catch((err) => {
      if (err.abort) return
      return renderError(err)
    })
}

// This method handles all runtime and debug errors.
// 404 and 500 errors are special kind of errors
// and they are still handle via the main render method.
export function renderError (error) {
  // We need to unmount the current app component because it's
  // in the inconsistant state.
  // Otherwise, we need to face issues when the issue is fixed and
  // it's get notified via HMR
  ReactDOM.unmountComponentAtNode(appContainer)

  console.error(error)

  return ErrorComponent.getInitialProps({ err: error, pathname, query, asPath })
    .then((props) => {
      const appProps = { Component: ErrorComponent, props, err, router }
      renderReactElement(createElement(App, appProps), errorContainer)

      appContainer.innerHTML = ''
    })
}

let isInitialRender = true
function renderReactElement (reactEl, domEl) {
  if (isInitialRender && domEl.firstChild) {
    ReactDOM.hydrate(reactEl, domEl)
    isInitialRender = false
  } else {
    ReactDOM.render(reactEl, domEl)
    isInitialRender = false
  }
}
