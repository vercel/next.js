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
  if ((/* @next-codemod-error Await this API and update its callers; remove the temporary UnsafeUnwrappedDraftMode cast after repairing the migration. */
  draftMode() as unknown as UnsafeUnwrappedDraftMode).isEnabled) {
    return null
  }

  return <p>page</p>
}

export function MyCookiesComponent() {
  const c = (/* @next-codemod-error Await this API and update its callers; remove the temporary UnsafeUnwrappedCookies cast after repairing the migration. */
  cookies() as unknown as UnsafeUnwrappedCookies)
  return c.get('name')
}

export function MyHeadersComponent() {
  const h = (/* @next-codemod-error Await this API and update its callers; remove the temporary UnsafeUnwrappedHeaders cast after repairing the migration. */
  headers() as unknown as UnsafeUnwrappedHeaders)
  return <p>{h.get('x-foo')}</p>
}

