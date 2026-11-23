'use client'

export function SsrError() {
  if (typeof window === 'undefined') {
    throw new Error('original-ssr-error')
  }
  return <p>Client content</p>
}
