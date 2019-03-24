import React from 'react'
import Link from 'next/link'
import Head from 'next/head'

const Home = () => (
  <div>
    <Head>
      <title>Home page</title>
    </Head>
    <h1>Hello from Next.js</h1>
    <p>
      This example aims to show that Next.js can be used to create static sites
      that don't use any JavaScript.
    </p>
    <p>The link below is a regular hyperlink.</p>
    <Link href='/about'>
      <a>Read more</a>
    </Link>{' '}
    about this example.
    <style jsx>{`
      a {
        text-decoration: none;
        color: #000;
        font-weight: bold;
      }

      a:hover,
      a:focus {
        text-decoration: underline;
      }
    `}</style>
  </div>
)

export default Home
