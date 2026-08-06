'use client'

export function ErrorInSSR({ children }) {
  if (typeof window === 'undefined') {
    throw new Error('No SSR please')
  }
  return <>{children}</>
}
