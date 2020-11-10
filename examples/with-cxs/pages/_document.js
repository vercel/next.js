import Document, { Html, Head, Main, NextScript } from 'next/document'
import cxs from 'cxs/lite'

export default class MyDocument extends Document {
  static async getInitialProps({ renderPage }) {
    const page = await renderPage()
    const style = cxs.getCss()
    return { ...page, style }
  }

  render() {
    return (
      <Html>
        <Head>
          <style
            id="cxs-style"
            dangerouslySetInnerHTML={{ __html: this.props.style }}
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
