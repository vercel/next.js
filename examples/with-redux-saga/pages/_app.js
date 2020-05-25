import App from 'next/app'
import { END } from 'redux-saga'
import { wrapper } from '../store'

class MyApp extends App {
  static async getInitialProps({ Component, ctx }) {
    const pageProps = {
      ...(Component.getInitialProps
        ? await Component.getInitialProps(ctx)
        : {}),
    }

    if (ctx.req) {
      ctx.store.dispatch(END)
      await ctx.store.sagaTask.toPromise()
    }

    return { pageProps }
  }

  render() {
    const { Component, pageProps } = this.props
    return <Component {...pageProps} />
  }
}

export default wrapper.withRedux(MyApp)
