import React from 'react'
import Head from 'next/head'
import Link from 'next/link'

export default (props) => <div id='head-1'>
  <Head>
    <meta
      name='description'
      content='Head One'
    />
  </Head>
  <Link href='/nav/head-2'>
    <a id='to-head-2'>to head 2</a>
  </Link>
</div>
