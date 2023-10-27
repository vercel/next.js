import { Html, Head, Main, NextScript } from 'next/document'
import { Abel } from 'next/font/google'

// eslint-disable-next-line no-unused-vars
const abel = Abel({ weight: '400' })

export default function Document() {
  return (
    <Html>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
