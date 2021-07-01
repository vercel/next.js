import * as React from 'react'
import Head from 'next/head'
import { AppProps } from 'next/app'
function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>NaitveBase + NextJS Starter Kit</title>
        <meta
          name="description"
          content="NativeBase and NextJS starter kit for rapid setup and easy development experience with NativeBase."
        />
      </Head>
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
