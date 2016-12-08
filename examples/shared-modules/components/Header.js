import React from 'react'
import Link from 'next/link'
import 'next/prefetcher'

const styles = {
  a: {
    marginRight: 10
  }
}

export default () => (
  <div>
    <Link href='/'>
      <a style={styles.a} >Home</a>
    </Link>

    <Link href='/about'>
      <a style={styles.a} >About</a>
    </Link>
  </div>
)
