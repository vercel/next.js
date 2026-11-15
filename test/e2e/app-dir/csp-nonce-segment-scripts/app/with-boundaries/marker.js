'use client'

import { useState } from 'react'

export function Marker({ id }) {
  const [label] = useState(id)
  return <p id={id}>{label}</p>
}
