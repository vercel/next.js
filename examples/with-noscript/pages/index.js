import React from 'react'
import Noscript from '../components/Noscript'

export default function IndexPage() {
  return (
    <>
      <h1>noscript</h1>
      <p>Disable JavaScript to see it in action:</p>

      <hr />

      <Noscript>Noscript is enabled!</Noscript>
    </>
  )
}
