'use client'

import { useParams, useRouter } from 'next/navigation'

export function ParamDisplay() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params !== null ? params.id : null
  return (
    <>
      <p id="client-param">{id}</p>
      <p id="bfcache-id">{router.bfcacheId}</p>
    </>
  )
}
