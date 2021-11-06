import React from 'react'
import {
  useLegacyGetInitialProps,
  Html,
  Head,
  Main,
  NextScript,
} from 'next/document'

async function getInitialProps(ctx) {
  await new Promise((resolve) => {
    setTimeout(resolve, 200)
  })
  return { content: 'hello from legacy gip' }
}

export default function Document() {
  const { content } = useLegacyGetInitialProps(getInitialProps)
  return (
    <Html>
      <Head />
      <body>
        <Main />
        <NextScript />
        <span>{content}</span>
      </body>
    </Html>
  )
}
