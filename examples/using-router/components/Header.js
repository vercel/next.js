import React from 'react'
import Router from 'next/router'

const styles = {
  a: {
    marginRight: 10
  }
}

const Link = ({ children, href }) => (
  <a
    href='#'
    style={styles.a}
    onClick={(e) => {
      e.preventDefault()
      Router.push(href)
    }}
  >
    { children }
  </a>
)

export default () => (
  <div>
    <Link href='/'>Home</Link>
    <Link href='/about'>About</Link>
    <Link href='/error'>Error</Link>
  </div>
)
