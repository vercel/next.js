import Document, {
  DocumentContext,
  Head,
  Html,
  Main,
  NextScript,
} from 'next/document'

export default class MyDocument extends Document<{ nonce?: string }> {
  static async getInitialProps(ctx: DocumentContext) {
    const props = await Document.getInitialProps(ctx)
    return {
      ...props,
      nonce: ctx.req?.headers['x-nonce'] as string | undefined,
    }
  }

  render() {
    return (
      <Html>
        <Head nonce={this.props.nonce} />
        <body>
          <Main />
          <NextScript nonce={this.props.nonce} />
        </body>
      </Html>
    )
  }
}
