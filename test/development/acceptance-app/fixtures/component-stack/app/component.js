'use client'
const isClient = typeof window !== 'undefined'
export default function Component() {
  return (
    <div>
      <p>{isClient ? 'client' : 'server'}</p>
    </div>
  )
}
