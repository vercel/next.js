import Link from 'next/link'
import React from 'react'
import { useOvermind } from '../overmind'

function Header() {
  const { state } = useOvermind()

  return (
    <div>
      <h1>{state.page}</h1>
      <Link href="/">Home page</Link>
      <Link href="/about">About Page</Link>
    </div>
  )
}

export default Header
