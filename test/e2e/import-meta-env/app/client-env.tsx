'use client'

import { useEffect, useState } from 'react'

const env = import.meta.env
const { DEV, PROD, MODE, BASE_URL, SSR } = env
const bracketMode = import.meta.env['MODE']
const unknown = (env as unknown as Record<string, unknown>).UNKNOWN

export function ClientEnv() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div id="client-env-pending" />
  }

  return (
    <dl id="client-env">
      <dt>env</dt>
      <dd>{JSON.stringify({ DEV, PROD, MODE, BASE_URL, SSR })}</dd>
      <dt>bracket-mode</dt>
      <dd>{bracketMode}</dd>
      <dt>unknown</dt>
      <dd>{String(unknown)}</dd>
    </dl>
  )
}
