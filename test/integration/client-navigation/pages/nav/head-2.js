import React from 'react'
import Head from 'next/head'
import Link from 'next/link'

export default (props) => <div id='head-2'>
  <Head>
    <meta
      name='description'
      content='Head Two'
    />
    <title>this is head-2</title>
  </Head>
  <Link href='/nav/head-1'>
    <a id='to-head-1'>to head 1</a>
  </Link>
</div>
