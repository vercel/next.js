'use client'

import { useState } from 'react'

export function CrashButton() {
  const [crashed, setCrashed] = useState(false)
  if (crashed) throw new Error('Crash after viewing an Insight')
  return <button onClick={() => setCrashed(true)}>Crash during render</button>
}
