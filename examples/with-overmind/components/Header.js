import Link from 'next/link'
import React from 'react'
import { useOvermind } from '../overmind'

function Header () {
  const { state } = useOvermind()

  return (
    <div>
      <h1>{state.page}</h1>
      <Link href='/'>
        <a>Home page</a>
      </Link>
      <Link href='/about'>
        <a>About Page</a>
      </Link>
    </div>
  )
}

export default Header
