import * as React from 'react'
/// @ts-ignore
import { Main, NextScript, Head, Html } from 'next/document'
import Script from 'next/script'

export default function Document() {
  return (
    <Html>
      <Head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css?family=Voces"
        />
        <Script
          id="scriptBeforeInteractive"
          src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptBeforeInteractive"
          strategy="beforeInteractive"
        ></Script>
      </Head>
      <body>
        <Main />
        <NextScript />
        <div id="text" />
      </body>
    </Html>
  )
}
