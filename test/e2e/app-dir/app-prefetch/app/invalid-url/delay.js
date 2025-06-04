'use client'

import { useEffect } from 'react'
import { useState } from 'react'

export function Delay({ duration = 500, children }) {
  const [isVisible, setIsVisible] = useState(false)
  useEffect(() => {
    const timeout = setTimeout(() => setIsVisible(true), duration)
    return () => clearTimeout(timeout)
  }, [duration])

  if (!isVisible) return null
  return <>{children}</>
}
