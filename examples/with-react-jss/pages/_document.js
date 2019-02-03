import React from 'react'
import Document, { Head, Main, NextScript } from 'next/document'
import { SheetsRegistry, JssProvider, createGenerateId } from 'react-jss'

export default class JssDocument extends Document {
  static getInitialProps (ctx) {
    const registry = new SheetsRegistry()
    const generateId = createGenerateId()
    const page = ctx.renderPage(App => props => (
      <JssProvider registry={registry} generateId={generateId}>
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
