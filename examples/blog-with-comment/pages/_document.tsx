import Document, {
  Html,
  Head,
  Main,
  NextScript,
  DocumentContext,
} from 'next/document'

export default class MyDocument extends Document {
  static getInitialProps(ctx: DocumentContext) {
    return Document.getInitialProps(ctx)
  }

  render() {
    const meta = {
      title: 'Next.js Blog Starter Kit',
      description: 'Clone and deploy your own Next.js portfolio in minutes.',
    }

    return (
      <Html lang="en" className="bg-white text-gray-700 antialiased">
        <Head>
          <meta charSet="utf-8" />
          <meta name="robots" content="follow, index" />
          <meta name="description" content={meta.description} />
        </Head>

        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
