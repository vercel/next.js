import React from 'react'
import Document, { Head, Main, NextScript } from 'next/document'

// ---------------------------------------------

export default class CustomDocument extends Document {
  render () {
    return (<html lang='en-US'>
      <Head>
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <meta name='robots' content='noindex' />
        <link rel='stylesheet' href='/static/style.css' />
      </Head>

      <body>
        <Main />
        <NextScript />
      </body>
    </html>)
  }
}
