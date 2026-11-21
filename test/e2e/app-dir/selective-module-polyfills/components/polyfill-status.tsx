'use client'

import { useEffect, useState } from 'react'

// Evaluated when the client module is initialized. The polyfills have to run before this.
const canParseAtModuleInit =
  typeof window !== 'undefined' && typeof URL.canParse === 'function'
const arrayAtAtModuleInit =
  typeof window !== 'undefined' && typeof Array.prototype.at === 'function'

type Status = {
  canParseAtModuleInit: boolean
  canParseWorks: boolean
  arrayAtAtModuleInit: boolean
}

export function PolyfillStatus() {
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    setStatus({
      canParseAtModuleInit,
      canParseWorks:
        canParseAtModuleInit &&
        URL.canParse('https://example.com/path') &&
        !URL.canParse('not a url'),
      arrayAtAtModuleInit,
    })
  }, [])

  if (!status) {
    return <p id="status">pending</p>
  }

  return (
    <>
      <p id="status">hydrated</p>
      <p id="can-parse-at-module-init">{String(status.canParseAtModuleInit)}</p>
      <p id="can-parse-works">{String(status.canParseWorks)}</p>
      <p id="array-at-at-module-init">{String(status.arrayAtAtModuleInit)}</p>
    </>
  )
}
