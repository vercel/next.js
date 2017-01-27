import React from 'react'
import Document, { Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  static async getInitialProps (ctx) {
    return await Document.getInitialProps(ctx)
  }

  render () {
    return (
      <html>
        <Head />
        <body>
          <Main />
          <NextScript prefix='http://localhost:9999/' />
        </body>
      </html>
    )
  }
}
