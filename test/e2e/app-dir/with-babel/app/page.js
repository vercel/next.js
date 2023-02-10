'use client'

import { useState } from 'react'

export default function Page() {
  const state = useState('hello')[0]
  return <h1>{state}</h1>
}
