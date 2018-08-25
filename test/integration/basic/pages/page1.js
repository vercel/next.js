import React from 'react'
import Head from 'next/head'
import Link from 'next/link'

export default (props) => <div>
  <Head>
    <meta
      name='description'
      content='Page One'
    />
  </Head>
  <Link href='/page2'>
    <a id='page2'>Page 2</a>
  </Link>
</div>
