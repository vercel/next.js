import React, { Component, PropTypes } from 'react'
import { AppContainer } from 'react-hot-loader'
import shallowEquals from './shallow-equals'
import { warn } from './utils'

const ErrorDebug = process.env.NODE_ENV === 'production'
  ? null : require('./error-debug').default

export default class App extends Component {
  static childContextTypes = {
    headManager: PropTypes.object
  }

  getChildContext () {
    const { headManager } = this.props
    return { headManager }
  }

  render () {
    const { Component, props, err, router } = this.props
    const containerProps = { Component, props, router }

    return <div>
      <Container {...containerProps} />
      {ErrorDebug && err ? <ErrorDebug err={err} /> : null}
    </div>
  }

}

class Container extends Component {
  shouldComponentUpdate (nextProps) {
    // need this check not to rerender component which has already thrown an error
    return !shallowEquals(this.props, nextProps)
  }

  render () {
    const { Component, props, router } = this.props
    const url = createUrl(router)

    // includes AppContainer which bypasses shouldComponentUpdate method
    // https://github.com/gaearon/react-hot-loader/issues/442
    return <AppContainer>
      <Component {...props} url={url} />
    </AppContainer>
  }
}

function createUrl (router) {
  return {
    query: router.query,
    pathname: router.pathname,
    back: () => router.back(),
    push: (url, as) => router.push(url, as),
    pushTo: (href, as) => {
      warn(`Warning: 'url.pushTo()' is deprecated. Please use 'url.push()' instead.`)
      const pushRoute = as ? href : null
      const pushUrl = as || href

      return router.push(pushRoute, pushUrl)
    },
    replace: (url, as) => router.replace(url, as),
    replaceTo: (href, as) => {
      warn(`Warning: 'url.replaceTo()' is deprecated. Please use 'url.replace()' instead.`)
      const replaceRoute = as ? href : null
      const replaceUrl = as || href

      return router.replace(replaceRoute, replaceUrl)
    }
  }
}
