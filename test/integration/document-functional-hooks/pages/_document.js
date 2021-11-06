import React from 'react'
import { Html, Head, Main, NextScript } from './_document'

export default function Document() {
  const state = React.useState(null)
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
