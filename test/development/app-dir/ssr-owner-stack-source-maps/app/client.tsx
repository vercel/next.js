'use client'

import { useSearchParams } from 'next/navigation'

export function ReadSearchParams() {
  // Accessed outside of Suspense, so the dev overlay reports it together with
  // the owner stack of this Client Component. Its owners are Server
  // Components, whose frames come from fake functions created by the
  // server-side Flight client.
  useSearchParams()
  return null
}
