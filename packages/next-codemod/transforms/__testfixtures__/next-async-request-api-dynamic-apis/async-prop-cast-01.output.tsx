import React from 'react'
import {
  headers,
  cookies,
  draftMode,
  type DangerouslyUnwrapCookie,
  type DangerouslyUnwrapHeaders,
  type DangerouslyUnwrapDraftMode,
} from 'next/headers';

export function MyDraftComponent() {
if ((draftMode() as unknown as DangerouslyUnwrapDraftMode).isEnabled) {
    return null
  }

  return <p>page</p>
}

export function MyCookiesComponent() {
  const c = (cookies() as unknown as DangerouslyUnwrapCookie)
  return c.get('name')
}

export function MyHeadersComponent() {
  const h = (headers() as unknown as DangerouslyUnwrapHeaders)
  return (
    <p>{h.get('x-foo')}</p>
  )
}

