import Document, { Html, Head, Main, NextScript } from 'next/document'
import getConfig from 'next/config'

const config = getConfig()

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps }
  }

  render() {
    return (
      <Html>
        <Head />
        <body>
          <div id="doc-config">{JSON.stringify(config)}</div>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
