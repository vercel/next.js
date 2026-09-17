'use client'

import { useState } from 'react'

export default function OtherPage() {
  const [broken, setBroken] = useState(false)
  if (broken) throw new Error('Only the other document failed')
  return (
    <button id="break-page" onClick={() => setBroken(true)}>
      Break this page
    </button>
  )
}
