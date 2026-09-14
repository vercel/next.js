'use client'

export default function ClientRuntimeErrorPage() {
  if (typeof window !== 'undefined') {
    throw new Error('Test client runtime error')
  }

  return <p>Server render</p>
}
