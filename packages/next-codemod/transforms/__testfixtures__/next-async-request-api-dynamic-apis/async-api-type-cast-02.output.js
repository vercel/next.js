import React from 'react'
import { 
  headers,
  cookies, 
  draftMode, 
} from 'next/headers'

export function MyDraftComponent() {
if (/* Next.js Dynamic Async API Codemod: Manually await this call, if it's a Server Component */
draftMode().isEnabled) {
    return null
  }

  return <p>page</p>
}

export function MyCookiesComponent() {
  const c = /* Next.js Dynamic Async API Codemod: Manually await this call, if it's a Server Component */
  cookies()
  return c.get('name')
}

export function MyHeadersComponent() {
  const h = /* Next.js Dynamic Async API Codemod: Manually await this call, if it's a Server Component */
  headers()
  return (
    <p>{h.get('x-foo')}</p>
  )
}

