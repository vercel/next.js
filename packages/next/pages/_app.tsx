import React, { ErrorInfo } from 'react'
import {
  execOnce,
  loadGetInitialProps,
  AppContextType,
  AppInitialProps,
  AppPropsType,
} from '../next-server/lib/utils'
import { Router } from '../client/router'
import '../client/router'

export { AppInitialProps }

export type AppContext = AppContextType<Router>

export type AppProps<P = {}> = AppPropsType<Router, P>

/**
 * `App` component is used for initialize of pages. It allows for overwriting and full control of the `page` initialization.
 * This allows for keeping state between navigation, custom error handling, injecting additional data.
 */
async function appGetInitialProps({
  Component,
  ctx,
}: AppContext): Promise<AppInitialProps> {
  const pageProps = await loadGetInitialProps(Component, ctx)
  return { pageProps }
}

export default class App<P = {}, CP = {}, S = {}> extends React.Component<
  P & AppProps<CP>,
  S
> {
  static origGetInitialProps = appGetInitialProps
  static getInitialProps = appGetInitialProps

  // Kept here for backwards compatibility.
  // When someone ended App they could call `super.componentDidCatch`.
  // @deprecated This method is no longer needed. Errors are caught at the top level
  componentDidCatch(error: Error, _errorInfo: ErrorInfo): void {
    throw error
  }

  render() {
    const { router, Component, pageProps } = this.props as AppProps<CP>
    const url = createUrl(router)
    return <Component {...pageProps} url={url} />
  }
}

let warnContainer: () => void
let warnUrl: () => void

if (process.env.NODE_ENV !== 'production') {
  warnContainer = execOnce(() => {
    console.warn(
      `Warning: the \`Container\` in \`_app\` has been deprecated and should be removed. https://err.sh/zeit/next.js/app-container-deprecated`
    )
  })

  warnUrl = execOnce(() => {
    console.error(
      `Warning: the 'url' property is deprecated. https://err.sh/zeit/next.js/url-deprecated`
    )
  })
}

// @deprecated noop for now until removal
export function Container(p: any) {
  if (process.env.NODE_ENV !== 'production') warnContainer()
  return p.children
}

export function createUrl(router: Router) {
  // This is to make sure we don't references the router object at call time
  const { pathname, asPath, query } = router
  return {
    get query() {
      if (process.env.NODE_ENV !== 'production') warnUrl()
      return query
    },
    get pathname() {
      if (process.env.NODE_ENV !== 'production') warnUrl()
      return pathname
    },
    get asPath() {
      if (process.env.NODE_ENV !== 'production') warnUrl()
      return asPath
    },
    back: () => {
      if (process.env.NODE_ENV !== 'production') warnUrl()
      router.back()
    },
    push: (url: string, as?: string) => {
      if (process.env.NODE_ENV !== 'production') warnUrl()
      return router.push(url, as)
    },
    pushTo: (href: string, as?: string) => {
      if (process.env.NODE_ENV !== 'production') warnUrl()
      const pushRoute = as ? href : ''
      const pushUrl = as || href

      return router.push(pushRoute, pushUrl)
    },
    replace: (url: string, as?: string) => {
      if (process.env.NODE_ENV !== 'production') warnUrl()
      return router.replace(url, as)
    },
    replaceTo: (href: string, as?: string) => {
      if (process.env.NODE_ENV !== 'production') warnUrl()
      const replaceRoute = as ? href : ''
      const replaceUrl = as || href

      return router.replace(replaceRoute, replaceUrl)
    },
  }
}
