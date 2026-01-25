'use client'
import { useState } from 'react'

export function ShowScriptOrder() {
  const [order, setOrder] = useState(null)

  return (
    <>
      <p id="order">{JSON.stringify(order)}</p>
      <button
        id="get-order"
        onClick={() => {
          // Copy the array, otherwise React won't rerender after the
          // `window._script_order.push()` call
          setOrder([...(window._script_order || [])])
        }}
      >
        get order
      </button>
    </>
  )
}
