import Document, { Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  static getInitialProps ({ renderPage, req }) {
    const isServer = !!req
    if (isServer) {
      // eslint-disable-next-line no-eval
      const ServerStyleSheet = eval("require('styled-components').ServerStyleSheet")
      const sheet = new ServerStyleSheet()
      const page = renderPage(sheet.collectStyles.bind(sheet))
      const styleTags = sheet.getStyleTags()
      return { ...page, styleTags }
    }
    return {}
  }

  render () {
    return (
      <html>
        <Head>
          <title>Next with styled-components</title>
          {this.props.styleTags}
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
