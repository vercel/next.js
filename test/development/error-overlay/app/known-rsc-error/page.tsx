import { unstable_cache } from 'next/cache'
import { headers } from 'next/headers'
import React from 'react'

export default async function Page() {
  const getData = unstable_cache(async () => {
    const h = await headers()
    return h.get('x-test-header')
  }, ['test-header-key'])

  return <div>{await getData()}</div>
}
