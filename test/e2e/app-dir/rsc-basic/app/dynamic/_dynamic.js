'use client'

import { useState } from 'react'

export default function Dynamic() {
  const [data] = useState('dynamic data!')
  return <h1>{data}</h1>
}
