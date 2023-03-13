import React, { ReactElement } from 'react'
import Head from 'next/head'
import { AppProps } from 'next/app'

import Layout from '../components/Layout'

import '../styles/app.scss'

export default function App({ Component, pageProps }: AppProps): ReactElement {
  return (
    <Layout>
      <Head>
        <title>react-md with next.js</title>
      </Head>
      <Component {...pageProps} />
    </Layout>
  )
}
