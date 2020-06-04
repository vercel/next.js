import App from 'next/app'
import { wrapper } from '../store'

export default wrapper.withRedux(
  class MyApp extends App {
    render() {
      const { Component, pageProps } = this.props
      return <Component {...pageProps} />
    }
  }
)
