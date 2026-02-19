'use client'

// Module-level state for the current HMR refresh hash.
//
// The hash is set by the hot-reloader when server component changes are
// detected, and consumed by fetchServerResponse to ensure cache busting works
// in cross-origin iframe contexts where cookies may not be transmitted due to
// SameSite=Lax restrictions.

let currentHmrRefreshHash: string | undefined

export function setCurrentHmrRefreshHash(hash: string): void {
  currentHmrRefreshHash = hash
}

export function getCurrentHmrRefreshHash(): string | undefined {
  return currentHmrRefreshHash
}
