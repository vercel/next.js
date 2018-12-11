import Document, { Head, Main, NextScript } from 'next/document'

const inlineScript = (body, nonce) => (
  <script type='text/javascript' dangerouslySetInnerHTML={{ __html: body }} nonce={nonce} />
)

export default class MyDocument extends Document {
  static async getInitialProps (ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    const { scriptNonce, styleNonce } = ctx
    return { ...initialProps, scriptNonce, styleNonce }
  }

  render () {
    const { scriptNonce, styleNonce } = this.props
    return (
      <html>
        <Head>
          <style nonce={styleNonce}>{`
            body {
              background: black;
              color: white;
            }
          `}</style>
          {inlineScript(`console.log('Inline script with nonce')`, scriptNonce)}
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
