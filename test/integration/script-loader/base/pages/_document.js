import * as React from 'react'
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
        <Script
          id="inline-before"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `console.log('inline beforeInteractive')`,
          }}
        ></Script>
      </Head>
      <body>
        <Main />
        <NextScript />
        <Script
          src="https://www.google-analytics.com/analytics.js?a=scriptBeforeInteractive"
          strategy="beforeInteractive"
        ></Script>
        <div id="text" />
      </body>
    </Html>
  )
}
