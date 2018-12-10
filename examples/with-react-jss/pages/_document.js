import React from 'react'
import Document, { Head, Main, NextScript } from 'next/document'
import { SheetsRegistry, JssProvider } from 'react-jss'

export default class JssDocument extends Document {
  static getInitialProps (ctx) {
    const registry = new SheetsRegistry()
    const page = ctx.renderPage(App => props => (
      <JssProvider registry={registry}>
        <App {...props} />
      </JssProvider>
    ))

    return {
      ...page,
      registry
    }
  }

  render () {
    return (
      <html>
        <Head>
          <style id='server-side-styles'>
            {this.props.registry.toString()}
          </style>
        </Head>

        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
