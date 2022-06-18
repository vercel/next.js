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

        <Script
          id="script-bi-inline-in-doc-in-head"
          strategy="beforeInteractive"
        >{`console.log('script-bi-inline-in-doc-in-head')`}</Script>
        <Script
          id="script-ai-inline-in-doc-in-head"
          strategy="afterInteractive"
        >{`console.log('script-ai-inline-in-doc-in-head')`}</Script>
        <Script
          id="script-lo-inline-in-doc-in-head"
          strategy="lazyOnload"
        >{`console.log('script-lo-inline-in-doc-in-head')`}</Script>
        {/* <Script
          id="script-w-inline-in-doc-in-head"
          strategy="worker"
        >{`console.log('script-w-inline-in-doc-in-head')`}</Script> */}
      </Head>
      <body>
        <Script
          id="script-bi-inline-in-doc-out-head"
          strategy="beforeInteractive"
        >{`console.log('script-bi-inline-in-doc-out-head')`}</Script>
        <Script
          id="script-ai-inline-in-doc-out-head"
          strategy="afterInteractive"
        >{`console.log('script-ai-inline-in-doc-out-head')`}</Script>
        <Script
          id="script-lo-inline-in-doc-out-head"
          strategy="lazyOnload"
        >{`console.log('script-lo-inline-in-doc-out-head')`}</Script>
        {/* <Script
          id="script-w-inline-in-doc-out-head"
          strategy="worker"
        >{`console.log('script-w-inline-in-doc-out-head')`}</Script> */}
        <Main />
        <NextScript />
        <div id="text" />
      </body>
    </Html>
  )
}
