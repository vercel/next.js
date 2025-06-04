'use client'

import { useState } from 'react'

import double, {
  inc,
  dec,
  redirectAction,
  getHeaders,
  renamed,
  slowInc,
} from './actions'
import { test } from './actions-lib'

export default function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <h1 id="count">{count}</h1>
      <button
        id="inc"
        onClick={async () => {
          const newCount = await inc(count)
          setCount(newCount)

          // test renamed action
          renamed()
        }}
      >
        +1
      </button>
      <button
        id="slow-inc"
        onClick={async () => {
          const newCount = await slowInc(count)
          setCount(newCount)
        }}
      >
        +1 (Slow)
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
          id="redirect-pages"
          formAction={() => redirectAction('/pages-dir')}
        >
          redirect to a pages route
        </button>
      </form>
      <form action={getHeaders}>
        <button type="submit" id="get-header">
          submit
        </button>
      </form>
      <form action={test}>
        <button>test</button>
      </form>
    </div>
  )
}
