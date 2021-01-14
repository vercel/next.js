import React from 'react'
import Link from 'next/link'

if (typeof window !== 'undefined') {
  window.caughtErrors = []
  const origError = window.console.error
  window.console.error = function (...args) {
    window.caughtErrors.push(args)
    origError(...args)
  }
}

const Home = () => {
  return (
    <>
      <Link href="#hash-link">
        <a>Hash Link</a>
      </Link>
    </>
  )
}

export default Home
