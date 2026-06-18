import { Html, Head, Main, NextScript } from 'next/document'
import { Abel } from 'next/font/google'

const abel = Abel({ weight: '400' })

export default function Document() {
  return (
    <Html>
      <Head />
      <body className={abel.variable}>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
