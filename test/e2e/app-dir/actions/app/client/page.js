'use client'

import { useState } from 'react'

import double, { inc, dec, redirectAction, refreshAction } from './actions'

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
      <button
        id="redirect"
        onClick={async () => {
          redirectAction('/client/target')
        }}
      >
        redirect
      </button>
      <button
        id="redirect-external"
        onClick={async () => {
          redirectAction('https://example.com')
        }}
      >
        redirect external
      </button>
      <button
        id="refresh"
        onClick={async () => {
          refreshAction()
        }}
      >
        refresh
      </button>
    </div>
  )
}
