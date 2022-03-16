import React from 'react'
import Document, { Html, Head, Main, NextScript } from 'next/document'
export default class CustomDocument extends Document {
  static getInitialProps = async (ctx) => {
    let helmetContext
    const page = ctx.renderPage({
      enhanceApp: (App) => (props) => {
        const app = new App(props)
        helmetContext = app.helmetContext
        return app
      },
      enhancePage: (_Page) => page,
    })
    return { ...page, helmetContext }
  }

  render() {
    const { helmetContext } = this.props
    const htmlAttributes =
      (helmetContext.helmet || helmetContext.helmet) &&
      helmetContext.helmet.htmlAttributes.toComponent()
    const bodyAttributes =
      (helmetContext.helmet || helmetContext.helmet) &&
      helmetContext.helmet.bodyAttributes.toComponent()
    return (
      <Html {...htmlAttributes}>
        <Head>
          {(helmetContext.helmet || helmetContext.helmet) &&
            helmetContext.helmet.title.toComponent()}
          {(helmetContext.helmet || helmetContext.helmet) &&
            helmetContext.helmet.meta.toComponent()}
          {(helmetContext.helmet || helmetContext.helmet) &&
            helmetContext.helmet.link.toComponent()}
        </Head>
        <body {...bodyAttributes}>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
