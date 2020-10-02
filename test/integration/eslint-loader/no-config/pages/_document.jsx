import * as React from 'react'
import Document, { Main, NextScript, Head } from 'next/document'

export default class MyDocument extends Document {
  render() {
    return (
      <html>
        <Head>
          <link
            rel="shortcut icon"
            type="image/png"
            href="/static/images/favicon.png"
          />
          <script src="https://www.google-analytics.com/analytics.js"></script>
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
