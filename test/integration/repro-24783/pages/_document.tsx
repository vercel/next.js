import Document, {
  DocumentContext,
  Head,
  Html,
  Main,
  NextScript,
} from 'next/document'

export default class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps }
  }

  render() {
    console.log('00000', process.env.NODE_ENV)

    return (
      <Html lang="en">
        <Head>
          {process.env.NODE_ENV === 'production' ? (
            <>
              <script id="hello" />
              <script />
            </>
          ) : null}
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
