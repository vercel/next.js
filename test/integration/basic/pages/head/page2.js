import React from 'react'
import Head from 'next/head'
import Link from 'next/link'

export default (props) => <div>
  <Head>
    <meta
      name='description'
      content='Page Two'
    />
  </Head>
  <Link href='/head/page1'>Page 1</Link>
</div>
