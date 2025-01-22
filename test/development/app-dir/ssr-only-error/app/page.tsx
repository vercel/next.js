'use client'

export default function Page() {
  if (typeof window === 'undefined') {
    throw new Error('SSR only error')
  }
  return <p>hello world</p>
}
