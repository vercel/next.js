import React from 'react'
import Head from 'next/head'
import Link from 'next/link'

const Head3 = (props) => (
  <div id="head-3">
    <Head>
      <meta name="description" content="Head Three" />
      <title></title>
    </Head>
    <Link href="/nav/head-1">
      <a id="to-head-1">to head 1</a>
    </Link>
  </div>
)

export default Head3
