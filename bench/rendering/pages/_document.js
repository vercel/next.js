import { Html, Head, Main, NextScript } from 'next/document'
import * as mermaid from 'mermaid'
console.log(mermaid)

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
