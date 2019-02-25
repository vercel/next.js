import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { execOnce, loadGetInitialProps } from 'next-server/dist/lib/utils'
import { makePublicRouterInstance } from 'next/router'

export default class App extends Component {
  static childContextTypes = {
    router: PropTypes.object
  }

  static async getInitialProps ({ Component, router, ctx }) {
    const pageProps = await loadGetInitialProps(Component, ctx)
    return { pageProps }
  }

  getChildContext () {
    return {
      router: makePublicRouterInstance(this.props.router)
    }
  }

  // Kept here for backwards compatibility.
  // When someone ended App they could call `super.componentDidCatch`. This is now deprecated.
  componentDidCatch (err) {
    throw err
  }

  render () {
    const { router, Component, pageProps } = this.props
    const url = createUrl(router)
    return (
      <Container>
        <Component {...pageProps} url={url} />
      </Container>
    )
  }
}

export class Container extends Component {
  componentDidMount () {
    this.scrollToHash()
  }

  componentDidUpdate () {
    this.scrollToHash()
  }

  scrollToHash () {
    let { hash } = window.location
    hash = hash ? hash.substring(1) : false
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
  const { pathname, asPath, query } = router
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
