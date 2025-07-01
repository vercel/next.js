'use client'

export default function Page() {
  if (typeof window !== 'undefined') {
    throw new Error('Error on client')
  }
  return <p>page</p>
}
