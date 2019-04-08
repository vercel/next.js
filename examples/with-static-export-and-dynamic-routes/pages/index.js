import React from 'react'
import Head from 'next/head'
import Link from 'next/link'

const Homepage = () => (
  <main>
    <Head>
      <title>Home page</title>
    </Head>

    <h1>Home page</h1>

    <section>
      <Link href='/posts'>
        <a>All Posts</a>
      </Link>
    </section>
  </main>
)

export default Homepage
