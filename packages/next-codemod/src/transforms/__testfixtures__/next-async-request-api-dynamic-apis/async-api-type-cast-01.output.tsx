import React from 'react'
import {
  headers,
  cookies,
  draftMode,
  type UnsafeUnwrappedHeaders,
  type UnsafeUnwrappedCookies,
  type UnsafeUnwrappedDraftMode,
} from 'next/headers';

export function MyDraftComponent() {
  if ((draftMode() as unknown as UnsafeUnwrappedDraftMode).isEnabled) {
    return null
  }

  return <p>page</p>
}

export function MyCookiesComponent() {
  const c = (cookies() as unknown as UnsafeUnwrappedCookies)
  return c.get('name')
}

export function MyHeadersComponent() {
  const h = (headers() as unknown as UnsafeUnwrappedHeaders)
  return <p>{h.get('x-foo')}</p>
}

