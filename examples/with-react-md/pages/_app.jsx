import React from 'react'
import Head from 'next/head'

import Layout from '../components/Layout'

import '../styles/app.scss'

export default function App({ Component, pageProps }) {
  return (
    <Layout>
      <Head>
        <title>react-md with next.js</title>
      </Head>
      <Component {...pageProps} />
    </Layout>
  )
}
