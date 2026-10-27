'use client'
import { useEffect, useState } from 'react'

export default function Page() {
  const [url, setUrl] = useState('')
  useEffect(() => {
    setUrl(new URL('external-url-asset/worker.mjs', import.meta.url).pathname)
  }, [])
  return <p id="url">{url}</p>
}
