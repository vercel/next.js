'use client'

import { useEffect, useState } from 'react'

export function DocumentStamp() {
  const [stamp, setStamp] = useState('')

  useEffect(() => {
    setStamp(String(Math.round(performance.timeOrigin)))
  }, [])

  return (
    <p>
      Document loaded at: <code id="document-stamp">{stamp}</code>
    </p>
  )
}
