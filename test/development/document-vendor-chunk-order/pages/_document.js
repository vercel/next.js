import { Html, Head, Main, NextScript } from 'next/document'
import depA from 'dep-a'
import depB from 'dep-b'

export default function Document() {
  return (
    <Html data-deps={`${depA} ${depB}`}>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
