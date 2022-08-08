import Document, { Html, Head, Main, NextScript } from 'next/document'
import { GTM_ID } from '../lib/gtm'

export default class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head />
        <body>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
