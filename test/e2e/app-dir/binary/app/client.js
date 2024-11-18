'use client'

import { useEffect, useState } from 'react'

export function Client({ binary, arbitrary }) {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <>
      <div>utf8 binary: {new TextDecoder().decode(binary)}</div>
      <div>arbitrary binary: {String(arbitrary)}</div>
      <div>hydrated: {String(hydrated)}</div>
    </>
  )
}
