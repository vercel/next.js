'use client'

import { useState } from 'react'

import { serverAction } from './action'

export default function Home() {
  const [response, setResponse] = useState(null)

  return (
    <div>
      <button
        id="button"
        onClick={async function () {
          try {
            await serverAction()
          } catch (e) {
            console.error(e)
            setResponse(e)
          }
        }}
      >
        Crash
      </button>
      <br />
      <textarea value={JSON.stringify(response)} readOnly />
    </div>
  )
}
