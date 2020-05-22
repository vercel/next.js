import App from 'next/app'
import { createCss } from '@stitches/css'
import { Provider, config } from '../css'

/*
  With Typescript:
  export default class MyApp extends App<{ serverCss: TCss<typeof config> }> {
*/
export default class MyApp extends App {
  render() {
    const { Component, pageProps, serverCss } = this.props
    return (
      <Provider css={serverCss || createCss(config)}>
        <Component {...pageProps} />
      </Provider>
    )
  }
}
