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
    const { Component, props, hash, err, router } = this.props
    const containerProps = { Component, props, hash, router }

    return <div>
      <Container {...containerProps} />
      {ErrorDebug && err ? <ErrorDebug error={err} /> : null}
    </div>
  }
}

class Container extends Component {
  componentDidMount () {
    this.scrollToHash()
  }

  componentDidUpdate () {
    this.scrollToHash()
  }

  scrollToHash () {
    const { hash } = this.props
    const el = document.getElementById(hash)
    if (el) {
      // If we call scrollIntoView() in here without a setTimeout
      // it won't scroll properly.
      setTimeout(() => el.scrollIntoView(), 0)
    }
  }

  shouldComponentUpdate (nextProps) {
    // need this check not to rerender component which has already thrown an error
    return !shallowEquals(this.props, nextProps)
  }

  render () {
    const { Component, props, router } = this.props
    const url = createUrl(router)

    // includes AppContainer which bypasses shouldComponentUpdate method
    // https://github.com/gaearon/react-hot-loader/issues/442
    return <AppContainer errorReporter={ErrorDebug}>
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
