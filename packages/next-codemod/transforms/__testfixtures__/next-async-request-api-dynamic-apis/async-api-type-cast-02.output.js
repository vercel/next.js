import React from 'react'
import { 
  headers,
  cookies, 
  draftMode, 
} from 'next/headers'

export function MyDraftComponent() {
if (/* Next.js Dynamic Async API Codemod: please manually await this call, if it's a server component, you can turn it to async function */
draftMode().isEnabled) {
    return null
  }

  return <p>page</p>
}

export function MyCookiesComponent() {
  const c = /* Next.js Dynamic Async API Codemod: please manually await this call, if it's a server component, you can turn it to async function */
  cookies()
  return c.get('name')
}

export function MyHeadersComponent() {
  const h = /* Next.js Dynamic Async API Codemod: please manually await this call, if it's a server component, you can turn it to async function */
  headers()
  return (
    <p>{h.get('x-foo')}</p>
  )
}

