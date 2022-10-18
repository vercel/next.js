import Document, { Html, Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head crossOrigin="anonymous">
          <script
            dangerouslySetInnerHTML={{ __html: 'IntersectionObserver = null' }}
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
