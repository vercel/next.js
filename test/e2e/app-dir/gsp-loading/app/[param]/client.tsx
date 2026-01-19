'use client'

import { use, useSyncExternalStore } from 'react'

export function Client({
  searchParams: serverSearchParams,
}: {
  searchParams: Promise<Record<string, undefined | string | string[]>>
}) {
  const browserSearchParams = useSyncExternalStore(
    () => () => {},
    () => serverSearchParams,
    () => null
  )

  console.log(
    browserSearchParams === null
      ? 'search params not used'
      : 'search params used'
  )

  const searchParams =
    browserSearchParams !== null ? use(browserSearchParams) : null

  return (
    <div>
      <pre>{JSON.stringify(searchParams, null, 2)}</pre>
    </div>
  )
}
