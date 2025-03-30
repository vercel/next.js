'use client'

export default function Page() {
  return <p>{typeof window === 'undefined' ? 'server' : 'client'}</p>
}
