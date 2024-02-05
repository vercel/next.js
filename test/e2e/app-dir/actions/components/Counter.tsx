'use client'
import React from 'react'

export function Counter({ onClick }) {
  const [count, setCount] = React.useState(0)
  return (
    <>
      <h1 id="count">{count}</h1>
      <button
        id="increment"
        onClick={async () => {
          const newCount = await onClick()
          setCount(newCount)
        }}
      >
        +1
      </button>
    </>
  )
}
