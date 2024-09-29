import React from 'react'
import { 
  headers,
  cookies, 
  draftMode, 
} from 'next/headers'

export function MyDraftComponent() {
if (/* TODO: please manually await this call, codemod cannot transform due to undetermined async scope */
draftMode().isEnabled) {
    return null
  }

  return <p>page</p>
}

export function MyCookiesComponent() {
  const c = /* TODO: please manually await this call, codemod cannot transform due to undetermined async scope */
  cookies()
  return c.get('name')
}

export function MyHeadersComponent() {
  const h = /* TODO: please manually await this call, codemod cannot transform due to undetermined async scope */
  headers()
  return (
    <p>{h.get('x-foo')}</p>
  )
}

