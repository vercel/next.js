'use client'

import { useEffect, useState } from 'react'
import { moduleUrl } from '../../linked/root-info.mjs'

export default function Client() {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    setUrl(moduleUrl)
  }, [])

  return <pre id="client-root-info">{url && JSON.stringify({ url })}</pre>
}
