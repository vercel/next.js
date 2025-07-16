import { useState, useEffect } from 'react'

export function useSessionState<T extends string>(
  key: string,
  initialValue: T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (
      typeof window !== 'undefined' &&
      typeof sessionStorage !== 'undefined'
    ) {
      const stored = sessionStorage.getItem(key)
      return (stored as T) ?? initialValue
    }
    return initialValue
  })
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      typeof sessionStorage !== 'undefined'
    ) {
      sessionStorage.setItem(key, value)
    }
  }, [key, value])
  return [value, setValue]
}
