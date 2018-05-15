import * as React from 'react'
import Document, { Head, Main, NextScript } from '../../../../../document'

export default class MyDocument extends Document {
  static async getInitialProps (ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps, customProperty: 'Hello Document' }
  }

  render () {
    return (
      <html>
        <Head />
        <body className='different-class-name'>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
