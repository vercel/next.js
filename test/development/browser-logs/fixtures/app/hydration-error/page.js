'use client'

export default function Page() {
  const isClient = typeof window !== 'undefined'
  return (
    <div>
      <p>{isClient ? 'client' : 'server'}</p>
    </div>
  )
}
