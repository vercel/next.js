import App from 'next/app'
import { captureException } from '../utils/sentry'

class MyApp extends App {
  // This reports errors before rendering, when fetching initial props
  static async getInitialProps (appContext) {
    const { Component, ctx } = appContext

    let pageProps = {}

    try {
      if (Component.getInitialProps) {
        pageProps = await Component.getInitialProps(ctx)
      }
    } catch (e) {
      captureException(e, ctx)
      throw e // you can also skip re-throwing and set property on pageProps
    }

    return {
      pageProps
    }
  }

  // This reports errors thrown while rendering components
  componentDidCatch (error, errorInfo) {
    captureException(error, { errorInfo })
    super.componentDidCatch(error, errorInfo)
  }
}

export default MyApp
