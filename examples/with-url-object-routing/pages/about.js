import React from 'react'
import Link from 'next/link'
import Router, { withRouter } from 'next/router'

const href = {
  pathname: '/about',
  query: { name: 'zeit' },
}

const as = {
  pathname: '/about/zeit',
  hash: 'title-1',
}

const handleClick = () => Router.push(href, as)

export default withRouter(({ router: { query } }) => (
  <div>
    <h1>About {query.name}</h1>
    {query.name === 'zeit' ? (
      <Link href="/">
        <a>Go to home page</a>
      </Link>
    ) : (
      <button onClick={handleClick}>Go to /about/zeit</button>
    )}
  </div>
))
