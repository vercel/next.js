import Document, { Html, Head, Main, NextScript } from 'next/document'

const docValue = await Promise.resolve('doc value')

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps, docValue }
  }

  render() {
    return (
      <Html>
        <Head />
        <body>
          <div id="doc-value">{this.props.docValue}</div>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
