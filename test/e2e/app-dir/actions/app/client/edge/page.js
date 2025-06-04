'use client'

import { useState } from 'react'

import double, { inc, dec, redirectAction, getHeaders } from '../actions'

export default function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <h1>{count}</h1>
      <button
        id="inc"
        onClick={async () => {
          const newCount = await inc(count)
          setCount(newCount)
        }}
      >
        +1
      </button>
      <button
        id="dec"
        onClick={async () => {
          const newCount = await dec(count)
          setCount(newCount)
        }}
      >
        -1
      </button>
      <button
        id="double"
        onClick={async () => {
          const newCount = await double(count)
          setCount(newCount)
        }}
      >
        *2
      </button>
      <form>
        <button
          id="redirect-relative"
          formAction={() => redirectAction('/redirect-target')}
        >
          redirect to a relative URL
        </button>
      </form>
      <form>
        <button
          id="redirect-absolute"
          formAction={() =>
            redirectAction(`${location.origin}/redirect-target`)
          }
        >
          redirect to a absolute URL
        </button>
      </form>
      <form>
        <button
          id="redirect-external"
          formAction={() =>
            redirectAction(
              'https://next-data-api-endpoint.vercel.app/api/random?page'
            )
          }
        >
          redirect external
        </button>
      </form>
      <form>
        <button id="get-headers" formAction={() => getHeaders()}>
          get headers
        </button>
      </form>
    </div>
  )
}

export const runtime = 'edge'
