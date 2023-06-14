'use client'

import { useState } from 'react'

import double, { inc, dec, redirectAction, getHeaders } from './actions'

export default function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <h1>{count}</h1>
      <button
        id="inc"
        onClick={async () => {
          console.log(inc)
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
          id="redirect"
          formAction={() => redirectAction('/redirect-target')}
        >
          redirect
        </button>
      </form>
      <form>
        <button
          id="redirect-external"
          formAction={() => redirectAction('https://example.com')}
        >
          redirect external
        </button>
      </form>
      <form action={getHeaders}>
        <button type="submit" id="get-header">
          submit
        </button>
      </form>
    </div>
  )
}
