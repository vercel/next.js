'use client'

if (typeof window === 'undefined') {
  await new Promise((resolve) => setTimeout(resolve, 5_000))
}

export default function AsyncClient() {
  return <span id="slow-async-client">async client component</span>
}
