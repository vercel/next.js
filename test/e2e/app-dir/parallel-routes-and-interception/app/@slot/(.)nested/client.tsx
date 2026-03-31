'use client'

import { useState } from 'react'

export function Client() {
  const value = useState('client component')[0]
  return <p id="interception-slot-client">{value}</p>
}
