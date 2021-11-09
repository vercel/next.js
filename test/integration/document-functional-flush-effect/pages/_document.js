import React from 'react'
import { useFlushEffect, Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  useFlushEffect(() => `<foo />`)
  useFlushEffect(() => `<bar />`)
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
