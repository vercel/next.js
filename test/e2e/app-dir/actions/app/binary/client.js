'use client'

import { useState } from 'react'
import { gen } from './action'

export function Client({ data, arbitrary, action }) {
  const [payload, setPayload] = useState('')

  return (
    <>
      <div>prop: {new TextDecoder().decode(data)}</div>
      <div>arbitrary binary: {String(arbitrary)}</div>
      <div>action payload: {payload}</div>
      <button
        onClick={async () => {
          const r = await action()

          const { stream } = (await r.next()).value

          let result = ''

          const reader = stream.getReader()
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            result += new TextDecoder().decode(value)
            setPayload(result)
          }
        }}
      >
        send
      </button>
      <button
        onClick={async () => {
          for await (const value of await gen()) {
            setPayload(String(value))
          }
        }}
      >
        gen
      </button>
    </>
  )
}
