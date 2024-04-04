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
          setOrder(window._script_order)
        }}
      >
        get order
      </button>
    </>
  )
}
