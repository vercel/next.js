'use client'

export default function HmrRuntimeErrorPage() {
  if (typeof window !== 'undefined') {
    throw new Error('Test HMR runtime error')
  }

  return <p>Server render</p>
}
