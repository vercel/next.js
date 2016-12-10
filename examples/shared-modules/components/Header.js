import React from 'react'
import Link, { prefetch } from 'next/prefetch'

prefetch('/')

const styles = {
  a: {
    marginRight: 10
  }
}

export default () => (
  <div>
    <Link href='/' prefetch={false}>
      <a style={styles.a} >Home</a>
    </Link>

    <Link href='/about'>
      <a style={styles.a} >About</a>
    </Link>
  </div>
)
