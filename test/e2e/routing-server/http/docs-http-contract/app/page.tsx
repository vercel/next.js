'use client'
import { useState } from 'react'

export default function Page() {
  const [cookies, setCookies] = useState('')
  return (
    <main>
      <h1>HTTP contract</h1>
      <button
        onClick={async () => {
          await fetch('/cookies/set')
          setCookies(
            JSON.stringify(await (await fetch('/cookies/read')).json())
          )
        }}
      >
        Read response cookies
      </button>
      <output>{cookies}</output>
    </main>
  )
}
