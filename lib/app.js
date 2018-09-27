import React, { Component } from 'react'
import PropTypes from 'prop-types'
import shallowEquals from './shallow-equals'
import { execOnce, loadGetInitialProps } from './utils'
import { makePublicRouterInstance } from './router'

export default class App extends Component {
  static childContextTypes = {
    _containerProps: PropTypes.any,
    headManager: PropTypes.object,
    router: PropTypes.object
  }

  static displayName = 'App'

  static async getInitialProps ({ Component, router, ctx }) {
    const pageProps = await loadGetInitialProps(Component, ctx)
    return {pageProps}
  }

  getChildContext () {
    const { headManager } = this.props
    return {
      headManager,
      router: makePublicRouterInstance(this.props.router),
      _containerProps: {...this.props}
    }
  }

  // Kept here for backwards compatibility.
  // When someone ended App they could call `super.componentDidCatch`. This is now deprecated.
  componentDidCatch (err) {
    throw err
  }

  render () {
    const {router, Component, pageProps} = this.props
    const url = createUrl(router)
    return <Container>
      <Component {...pageProps} url={url} />
    </Container>
  }
}

export class Container extends Component {
  static contextTypes = {
    _containerProps: PropTypes.any
  }

  componentDidMount () {
    this.scrollToHash()
  }

  shouldComponentUpdate (nextProps) {
    // need this check not to rerender component which has already thrown an error
    return !shallowEquals(this.props, nextProps)
  }

  componentDidUpdate () {
    this.scrollToHash()
  }

  scrollToHash () {
    const { hash } = this.context._containerProps
    if (!hash) return

    const el = document.getElementById(hash)
    if (!el) return

    // If we call scrollIntoView() in here without a setTimeout
    // it won't scroll properly.
    setTimeout(() => el.scrollIntoView(), 0)
  }

  render () {
    return this.props.children
  }
}

const warnUrl = execOnce(() => {
  if (process.env.NODE_ENV !== 'production') {
    console.error(`Warning: the 'url' property is deprecated. https://err.sh/zeit/next.js/url-deprecated`)
  }
})

export function createUrl (router) {
  // This is to make sure we don't references the router object at call time
  const {pathname, asPath, query} = router
  return {
    get query () {
      warnUrl()
      return query
    },
    get pathname () {
      warnUrl()
      return pathname
    },
    get asPath () {
      warnUrl()
      return asPath
    },
    back: () => {
      warnUrl()
      router.back()
    },
    push: (url, as) => {
      warnUrl()
      return router.push(url, as)
    },
    pushTo: (href, as) => {
      warnUrl()
      const pushRoute = as ? href : null
      const pushUrl = as || href

      return router.push(pushRoute, pushUrl)
    },
    replace: (url, as) => {
      warnUrl()
      return router.replace(url, as)
    },
    replaceTo: (href, as) => {
      warnUrl()
      const replaceRoute = as ? href : null
      const replaceUrl = as || href

      return router.replace(replaceRoute, replaceUrl)
    }
  }
}
