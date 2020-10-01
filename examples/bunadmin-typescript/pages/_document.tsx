import React from "react"
import Document, { Html, Head, Main, NextScript } from "next/document"
import { ServerStyleSheets } from "@material-ui/core/styles"
import { resetServerContext } from "react-beautiful-dnd"
import { defaultTheme, ENV } from "@bunred/bunadmin"

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang={ENV.I18N_CODE}>
        <Head>
          {/* PWA primary color */}
          <meta
            name="theme-color"
            content={defaultTheme.palette.primary.main}
          />
          <link
            href="https://fonts.googleapis.com/icon?family=Material+Icons"
            rel="stylesheet"
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

MyDocument.getInitialProps = async ctx => {
  // Render app and page and get the context of the page with collected side effects.
  const sheets = new ServerStyleSheets()
  const originalRenderPage = ctx.renderPage

  ctx.renderPage = () =>
    originalRenderPage({
      enhanceApp: App => props => {
        resetServerContext()
        return sheets.collect(<App {...props} />)
      }
    })

  const initialProps = await Document.getInitialProps(ctx)

  return {
    ...initialProps,
    // Styles fragment is rendered after the app and page rendering finish.
    styles: [
      ...React.Children.toArray(initialProps.styles),
      sheets.getStyleElement()
    ]
  }
}
