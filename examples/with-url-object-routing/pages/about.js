import React from 'react'
import Link from 'next/link'
import Router from 'next/router'

const href = {
  pathname: '/about',
  query: { name: 'zeit' }
}

const as = {
  pathname: '/about/zeit',
  hash: 'title-1'
}

const handleClick = () => Router.push(href, as)

export default (props) => (
  <div>
    <h1>About {props.url.query.name}</h1>
    {props.url.query.name === 'zeit' ? (
      <Link href='/'>
        <a>Go to home page</a>
      </Link>
    ) : (
      <button onClick={handleClick}>Go to /about/zeit</button>
    )}
  </div>
)
