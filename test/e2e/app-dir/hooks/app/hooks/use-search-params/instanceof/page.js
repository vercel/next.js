'use client'

import { useSearchParams, ReadonlyURLSearchParams } from 'next/navigation'
import { useSyncExternalStore } from 'react'

export default function Page() {
  const searchParams = useSearchParams()
  const searchParamsClient = useSyncExternalStore(
    () => {
      return () => {}
    },
    () => {
      return searchParams
    },
    () => {
      return null
    }
  )

  return (
    <ul>
      <li>
        server:{' '}
        <span data-testid="server" suppressHydrationWarning>
          {searchParams instanceof ReadonlyURLSearchParams
            ? 'PASS instanceof check'
            : `FAILED Received: "${String(searchParams)}" instead instanceof ${searchParams.constructor.name}`}
        </span>
      </li>
      <li>
        client:{' '}
        <span data-testid="client">
          {searchParamsClient === null
            ? '<pending>'
            : searchParamsClient instanceof ReadonlyURLSearchParams
              ? 'PASS instanceof check'
              : `FAILED Received: "${String(searchParamsClient)}" instead instanceof ${searchParamsClient.constructor.name}`}
        </span>
      </li>
    </ul>
  )
}
