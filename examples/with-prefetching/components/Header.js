import React from 'react'
import Link, { prefetch } from 'next/prefetch'

// Prefetch using the imperative API
prefetch('/')

const styles = {
  a: {
    marginRight: 10
  }
}

export default () => (
  <div>
    { /* Prefetch using the declarative API */ }
    <Link href='/'>
      <a style={styles.a} >Home</a>
    </Link>

    <Link href='/features'>
      <a style={styles.a} >Features</a>
    </Link>

    <Link href='/about'>
      <a style={styles.a} >About</a>
    </Link>

    <Link href='/contact' prefetch={false}>
      <a style={styles.a} >Contact (<small>NO-PREFETCHING</small>)</a>
    </Link>
  </div>
)
