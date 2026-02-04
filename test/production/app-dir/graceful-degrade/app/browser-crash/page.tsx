'use client'

export default function Page() {
  if (typeof window !== 'undefined') {
    throw new Error('boom')
  }
  return <p>fine</p>
}
