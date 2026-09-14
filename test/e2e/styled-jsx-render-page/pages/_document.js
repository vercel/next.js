import Document, { Html, Head, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    // This pattern bypasses defaultGetInitialProps which collects styled-jsx styles.
    // It calls ctx.renderPage() directly and returns { html, head } without styles.
    const { html, head } = await ctx.renderPage()
    return { html, head }
  }

  render() {
    return (
      <Html>
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
