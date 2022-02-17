import * as React from 'react'
/// @ts-ignore
import Document, { Main, NextScript, Head, Html } from 'next/document'
import Script from 'next/script'

export default class MyDocument extends Document {
  constructor(props) {
    super(props)
    const { __NEXT_DATA__, ids } = props
    if (ids) {
      __NEXT_DATA__.ids = ids
    }
  }

  render() {
    return (
      <Html>
        <Head>
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css?family=Voces"
          />
        </Head>
        <body>
          <Main />
          <NextScript />
          <Script
            id="scriptBeforeInteractive"
            src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
            strategy="beforeInteractive"
          ></Script>
          <div id="text" />
        </body>
      </Html>
    )
  }
}
