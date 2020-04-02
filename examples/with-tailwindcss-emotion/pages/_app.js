import React from 'react'
import Head from 'next/head'

import '../styles/base.css'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Tailwindcss Emotion Example</title>
      </Head>
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
