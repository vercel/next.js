import Document, { Html, Head, Main, NextScript } from 'next/document'
import { getStyles } from 'typestyle'

export default class MyDocument extends Document {
  static async getInitialProps({ renderPage }) {
    const page = await renderPage()
    const styleTags = getStyles()
    return { ...page, styleTags }
  }

  render() {
    return (
      <Html>
        <Head>
          <style id="styles-target">{this.props.styleTags}</style>
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
