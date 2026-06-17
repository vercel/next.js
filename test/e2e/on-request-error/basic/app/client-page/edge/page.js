'use client'

export default async function Page() {
  if (typeof window === 'undefined') {
    throw new Error('client-page-edge-error')
  }
  return <div>client-page</div>
}

export const runtime = 'edge'
