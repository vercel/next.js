'use client'

import { useState } from 'react'

export default function Details({ details }) {
  const [show, setShow] = useState(false)

  return show ? (
    <p>{details}</p>
  ) : (
    <button onClick={() => setShow(true)}>show details</button>
  )
}
