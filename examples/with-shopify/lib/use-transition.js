import { useState, useEffect } from 'react'

const defaultState = {
  hasHover: false,
  position: 0,
  delay: 1000,
}

export default function useTransition(length) {
  const [{ hasHover, position, delay }, setTransition] = useState(defaultState)
  const initTransition = () => {
    setTransition({ hasHover: true, position, delay })
  }
  const stopTransition = () => {
    setTransition(defaultState)
  }

  useEffect(() => {
    if (!hasHover || length < 1) return

    const timeout = setTimeout(() => {
      const next = position + 1

      setTransition({
        hasHover: true,
        position: next > length ? 0 : next,
        delay: 2200,
      })
    }, delay)

    return () => clearTimeout(timeout)
  }, [hasHover, position, delay, length])

  return { position, initTransition, stopTransition }
}
