import React from 'react'
import Document, { Head, Main, NextScript } from 'next/document'
import { SheetsRegistry, JssProvider } from 'react-jss'

export default class JssDocument extends Document {
  static async getInitialProps (ctx) {
    const registry = new SheetsRegistry()
    const originalRenderPage = ctx.renderPage
    ctx.renderPage = () =>
      originalRenderPage({
        enhanceApp: App => props => (
          <JssProvider registry={registry}>
            <App {...props} />
          </JssProvider>
        )
      })

    const initialProps = await Document.getInitialProps(ctx)

    return {
      ...initialProps,
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
