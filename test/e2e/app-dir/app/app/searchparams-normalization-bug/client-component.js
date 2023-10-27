'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback } from 'react'

export default function Button({ value, children }) {
  const router = useRouter()
  const pathname = usePathname()

  const setSearchParams = useCallback(() => {
    const params = new URLSearchParams()
    params.set('val', value)
    router.replace(`${pathname}?${params}`)
  }, [router, pathname, value])

  return (
    <button id={`button-${value}`} onClick={setSearchParams}>
      {children}
    </button>
  )
}
