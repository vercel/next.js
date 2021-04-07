import Document, { Html, Head, Main, NextScript } from 'next/document'
import PlausibleProvider from 'next-plausible'

export default class MyDocument extends Document {
  render() {
    return (
      <PlausibleProvider domain={process.env.NEXT_PUBLIC_DOMAIN}>
        <Html>
          <Head />
          <body>
            <Main />
            <NextScript />
          </body>
        </Html>
      </PlausibleProvider>
    )
  }
}
