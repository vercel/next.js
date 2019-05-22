import React, {ErrorInfo} from 'react'
import PropTypes from 'prop-types'
import { execOnce, loadGetInitialProps, AppContextType, AppInitialProps, AppPropsType } from 'next-server/dist/lib/utils'
import { Router, makePublicRouterInstance } from '../client/router'

export { AppInitialProps }

export type AppContext = AppContextType<Router>

export type AppProps<P = {}> = AppPropsType<Router, P>

async function appGetInitialProps({ Component, ctx }: AppContext): Promise<AppInitialProps> {
  const pageProps = await loadGetInitialProps(Component, ctx)
  return { pageProps }
}

export default class App<P = {}, CP = P> extends React.Component<P & AppProps<CP>> {
  static childContextTypes = {
    router: PropTypes.object,
  }
  static origGetInitialProps = appGetInitialProps
  static getInitialProps = appGetInitialProps

  getChildContext() {
    return {
      router: makePublicRouterInstance(this.props.router),
    }
  }

  // Kept here for backwards compatibility.
  // When someone ended App they could call `super.componentDidCatch`.
  // @deprecated This method is no longer needed. Errors are caught at the top level
  componentDidCatch(error: Error, _errorInfo: ErrorInfo): void {
    throw error
  }

  render() {
    const { router, Component, pageProps } = this.props as AppProps<CP>
    const url = createUrl(router)
    return (
      <Container>
        <Component {...pageProps} url={url} />
      </Container>
    )
  }
}

export class Container extends React.Component {
  componentDidMount() {
    this.scrollToHash()
  }

  componentDidUpdate() {
    this.scrollToHash()
  }

  private scrollToHash() {
    let { hash } = window.location
    hash = hash && hash.substring(1)
    if (!hash) return

    const el = document.getElementById(hash)
    if (!el) return

    // If we call scrollIntoView() in here without a setTimeout
    // it won't scroll properly.
    setTimeout(() => el.scrollIntoView(), 0)
  }

  render() {
    return this.props.children
  }
}

const warnUrl = execOnce(() => {
  if (process.env.NODE_ENV !== 'production') {
    console.error(`Warning: the 'url' property is deprecated. https://err.sh/zeit/next.js/url-deprecated`)
  }
})

export function createUrl(router: Router) {
  // This is to make sure we don't references the router object at call time
  const { pathname, asPath, query } = router
  return {
    get query() {
      warnUrl()
      return query
    },
    get pathname() {
      warnUrl()
      return pathname
    },
    get asPath() {
      warnUrl()
      return asPath
    },
    back: () => {
      warnUrl()
      router.back()
    },
    push: (url: string, as?: string) => {
      warnUrl()
      return router.push(url, as)
    },
    pushTo: (href: string, as?: string) => {
      warnUrl()
      const pushRoute = as ? href : ''
      const pushUrl = as || href

      return router.push(pushRoute, pushUrl)
    },
    replace: (url: string, as?: string) => {
      warnUrl()
      return router.replace(url, as)
    },
    replaceTo: (href: string, as?: string) => {
      warnUrl()
      const replaceRoute = as ? href : ''
      const replaceUrl = as || href

      return router.replace(replaceRoute, replaceUrl)
    },
  }
}
