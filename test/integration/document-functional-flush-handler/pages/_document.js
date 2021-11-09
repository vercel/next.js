import React from 'react'
import { useFlushHandler, Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  useFlushHandler(() => `<foo />`)
  useFlushHandler(() => `<bar />`)
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
