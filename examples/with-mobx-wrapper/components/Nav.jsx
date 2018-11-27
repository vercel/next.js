import React from 'react'
import Link from 'next/link'
import Head from 'next/head'

const Nav = () => (
  <React.Fragment>
    <Head>
      <meta
        name='viewport'
        content='width=device-width, initial-scale=1, user-scalable=no'
      />
      <title>Next.js with next-mobx-wrapper</title>
    </Head>
    <ul>
      <li>
        <Link href='/'>
          <a>Home</a>
        </Link>
      </li>
      <li>
        <Link href='/other'>
          <a>Other</a>
        </Link>
      </li>
    </ul>
  </React.Fragment>
)

export default Nav
