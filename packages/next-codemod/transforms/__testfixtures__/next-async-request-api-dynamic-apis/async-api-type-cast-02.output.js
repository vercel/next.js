import React from 'react'
import { 
  headers,
  cookies, 
  draftMode, 
} from 'next/headers'

export function MyDraftComponent() {
if (/* @next-codemod-error Manually await this call and refactor the function to be async */
draftMode().isEnabled) {
    return null
  }

  return <p>page</p>
}

export function MyCookiesComponent() {
  const c = /* @next-codemod-error Manually await this call and refactor the function to be async */
  cookies()
  return c.get('name')
}

export function MyHeadersComponent() {
  const h = /* @next-codemod-error Manually await this call and refactor the function to be async */
  headers()
  return (
    <p>{h.get('x-foo')}</p>
  )
}

