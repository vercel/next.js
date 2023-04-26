'use client'

import { useState } from 'react'

export default function UI({ getCookie, getHeader, getAuthedUppercase }) {
  const [result, setResult] = useState('')

  return (
    <div>
      <h1>{result}</h1>
      <button
        id="cookie"
        onClick={async () => {
          // set cookie
          const random = Math.random()
          document.cookie = `random=${random}`
          const res = await getCookie('random')
          setResult(random + ':' + res.value)
        }}
      >
        getCookie
      </button>
      <button
        id="header"
        onClick={async () => {
          const res = await getHeader('User-Agent')
          setResult(res)
        }}
      >
        getHeader
      </button>
      <button
        id="authed"
        onClick={async () => {
          try {
            const res = await getAuthedUppercase('hello, world')
            setResult(res)
          } catch (err) {
            setResult('Error: ' + err.message)
          }
        }}
      >
        getAuthedUppercase
      </button>
    </div>
  )
}
