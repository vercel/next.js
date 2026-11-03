'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { publicPath, setPublicPath } from '../shared'

export default function Client({ value }: { value: string }) {
  const router = useRouter()
  const [count, setCount] = useState(0)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return (
    <>
      <p id="refresh-value">{value}</p>
      <p id="refresh-count">{count}</p>
      <p id="refresh-public-path">{publicPath()}</p>
      <button
        id="refresh-loaded"
        disabled={!mounted}
        onClick={() => {
          setPublicPath('/unavailable-assets/')
          setCount((value) => value + 1)
          router.refresh()
        }}
      >
        Change public path and refresh
      </button>
    </>
  )
}
