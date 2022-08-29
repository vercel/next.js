import { Html, Head, Main, NextScript } from 'next/document'
import { ServerStyleSheet } from 'styled-components'

export default function Document() {
  const sheet = new ServerStyleSheet()
  const main = sheet.collectStyles(<Main />)
  const styleTags = sheet.getStyleElement()

  return (
    <Html>
      <Head>{styleTags}</Head>
      <body>
        <div className="root">{main}</div>
        <NextScript />
      </body>
    </Html>
  )
}
