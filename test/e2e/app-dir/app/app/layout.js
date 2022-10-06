import { experimental_use as use } from 'react'
import Script from 'next/script'

import '../styles/global.css'
import './style.css'

export const config = {
  revalidate: 0,
}

async function getData() {
  return {
    world: 'world',
  }
}

export default function Root({ children }) {
  const { world } = use(getData())

  return (
    <html className="this-is-the-document-html">
      <head>
        <title>{`hello ${world}`}</title>
      </head>
      <body className="this-is-the-document-body">{children}</body>
      <Script strategy="afterInteractive" src="/test4.js" />
      <Script strategy="beforeInteractive" src="/test1.js" />
      <Script strategy="beforeInteractive" src="/test1.js" />
      <Script
        strategy="beforeInteractive"
        id="1.5"
      >{`console.log(1.5)`}</Script>
      <Script strategy="beforeInteractive" src="/test2.js" />
      <Script
        strategy="beforeInteractive"
        id="2.5"
        dangerouslySetInnerHTML={{ __html: `console.log(2.5)` }}
      />
      <Script strategy="beforeInteractive" src="/test3.js" />
    </html>
  )
}
