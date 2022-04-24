import Document, { Head, Html, Main, NextScript } from 'next/document'

export default class CustomDocument extends Document {
  static async getInitialProps(ctx) {
    let mainContentLength

    const originalRenderPage = ctx.renderPage
    // Keep renderPage synchronous since this integration test checks for
    // serial rendering
    ctx.renderPage = () => {
      const result = originalRenderPage()
      mainContentLength = result.html.length
      return result
    }

    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps, mainContentLength }
  }

  render() {
    return (
      <Html>
        <Head>
          <meta
            name="test-main-content-length"
            value={this.props.mainContentLength}
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
