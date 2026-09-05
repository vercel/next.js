'use client'

export default function HydrationRuntimeErrorPage() {
  return (
    <p id="hydration-content">
      {typeof window === 'undefined' ? 'server value' : 'client value'}
    </p>
  )
}
