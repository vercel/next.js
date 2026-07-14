import { ReadonlyURLSearchParams } from './readonly-url-search-params'

export function unstable_isUnrecognizedActionError(): boolean {
  throw new Error(
    '`unstable_isUnrecognizedActionError` can only be used on the client.'
  )
}

// A client component (its module has 'use client'), so importing it from a
// server component produces a client reference — server components can place
// the marker even though the reporting only exists on the client.
export { unstable_RouterTransitionEndMarker } from './router-transition-end-marker'

export { redirect, permanentRedirect } from './redirect'
export { notFound } from './not-found'
export { forbidden } from './forbidden'
export { unauthorized } from './unauthorized'
export { unstable_rethrow } from './unstable-rethrow'
export { ReadonlyURLSearchParams }

export const RedirectType = {
  push: 'push',
  replace: 'replace',
} as const
