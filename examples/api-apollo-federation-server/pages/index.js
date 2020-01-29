import React from 'react'
import Link from 'next/link'

const Home = () => (
  <>
    <h1>Apollo federation demo for next.js</h1>
    <Link href="/api/graphql"> Full Schema </Link>
    <br />
    <Link href="/api/reviews"> Review Part </Link>
    <br />
    <Link href="/api/inventory"> Inventory Schema </Link>
    <br />
    <Link href="/api/products"> Products Schema </Link>
    <br />
    <Link href="/api/accounts"> Accounts Schema </Link>
    <br />
    <p>
      {' '}
      For more information about federation see{' '}
      <Link href="https://www.apollographql.com/docs/apollo-server/federation/introduction/">
        Apollo Federation overview
      </Link>
    </p>
  </>
)

export default Home
