import { createCss } from '@stitches/css'
import App from 'next/app'
import { config, Provider } from '../css'

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
