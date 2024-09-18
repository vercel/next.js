import React from 'react'
import { 
  headers,
  cookies, 
  draftMode, 
} from 'next/headers'

export function MyDraftComponent() {
if (/* TODO: await this async call and propagate the async correctly */
draftMode().isEnabled) {
    return null
  }

  return <p>page</p>
}

export function MyCookiesComponent() {
  const c = /* TODO: await this async call and propagate the async correctly */
  cookies()
  return c.get('name')
}

export function MyHeadersComponent() {
  const h = /* TODO: await this async call and propagate the async correctly */
  headers()
  return (
    <p>{h.get('x-foo')}</p>
  )
}

