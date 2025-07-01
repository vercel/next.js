'use client'

const date = new Date()
export { date }

if (typeof window === 'undefined') {
  throw new Error('boom')
}

export function ClientComponent() {
  return <div>Client Component</div>
}
