import { Html, Head, Main, NextScript } from 'next/document'
import docOnly from 'doc-only-pkg'
import shared from 'shared-pkg'

export default function Document() {
  return (
    <Html data-doc-only={docOnly} data-shared={shared}>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
