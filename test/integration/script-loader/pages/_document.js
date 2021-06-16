import * as React from 'react'
/// @ts-ignore
import Document, { Main, NextScript, Head } from 'next/document'
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
      <html>
        <Head>
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css?family=Voces"
          />
          <Script
            id="documentAfterInteractive"
            src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=documentAfterInteractive"
            strategy="afterInteractive"
          ></Script>
          <Script
            id="documentLazyOnload"
            src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=documentLazyOnload"
            strategy="lazyOnload"
          ></Script>
          <Script
            id="documentBeforeInteractive"
            src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=documentBeforeInteractive"
            strategy="beforeInteractive"
          ></Script>
        </Head>
        <body>
          <Main />
          <NextScript />
          <div id="text"></div>
        </body>
      </html>
    )
  }
}
