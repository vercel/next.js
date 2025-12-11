import React from 'react'
import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <h1>Home</h1>
      <Link href="/search">Go to Search</Link>
    </div>
  )
}
