import React from 'react'
import { cookies } from 'next/headers'

export default async function Page() {
  // try {
  //   cookies()
  // } catch (err) {
  //   console.error(err)
  // }
  return (
    <>
      <h2>Dynamic Component Catching Errors</h2>
      <p>
        This shows the dynamic component that reads cookies but wraps the read
        in a try/catch.
      </p>
      <div id="container"></div>
    </>
  )
}
