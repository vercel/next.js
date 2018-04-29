import React from 'react'
import Document, { Head, Main, NextScript } from 'next/document'
import * as snippet from '@segment/snippet'

const {
  // This write key is associated with https://segment.com/nextjs-example/sources/nextjs.
  ANALYTICS_WRITE_KEY = 'NPsk1GimHq09s7egCUlv7D0tqtUAU5wa',
  NODE_ENV = 'development'
} = process.env

export default class extends Document {
  static getInitialProps ({ renderPage }) {
    const { html, head, errorHtml, chunks } = renderPage()
    return { html, head, errorHtml, chunks }
  }

  renderSnippet () {
    const opts = {
      apiKey: ANALYTICS_WRITE_KEY,
      page: true // Set this to `false` if you want to manually fire `analytics.page()` from within your pages.
    }

    if (NODE_ENV === 'development') {
      return snippet.max(opts)
    }

    return snippet.min(opts)
  }

  render () {
    return (
      <html>
        <Head>
          {/* Inject the Segment snippet into the <head> of the document  */}
          <script dangerouslySetInnerHTML={{ __html: this.renderSnippet() }} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
