'use client'

export function ErrorInSSR() {
  if (typeof window === 'undefined') {
    throw new Error('No SSR please')
  }
  return <div>Hello, browser!</div>
}
