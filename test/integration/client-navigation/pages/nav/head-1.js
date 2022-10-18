import React from 'react'
import Head from 'next/head'
import Link from 'next/link'

export default (props) => (
  <div id="head-1">
    <Head>
      <meta name="description" content="Head One" />
      <title>this is head-1</title>
    </Head>
    <Link href="/nav/head-2" id="to-head-2">
      to head 2
    </Link>
    <Link href="/nav/head-3" id="to-head-3">
      to head 3
    </Link>
  </div>
)
