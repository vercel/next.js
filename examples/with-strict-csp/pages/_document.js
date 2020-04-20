import Document, { Head, Main, NextScript } from 'next/document'

const inlineScript = (body, nonce) => (
  <script
    type="text/javascript"
    dangerouslySetInnerHTML={{ __html: body }}
    nonce={nonce}
  />
)

export default class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx)

    if (!ctx.res) {
      throw new Error('Strict CSP only works on SSR pages!')
    }

    const { nonce } = ctx.res.locals
    return { ...initialProps, nonce }
  }

  render() {
    const { nonce } = this.props
    return (
      <html>
        <Head nonce={nonce}>
          {inlineScript(`console.log('Inline script with nonce')`, nonce)}
        </Head>
        <body>
          <Main />
          <NextScript nonce={nonce} />
        </body>
      </html>
    )
  }
}
