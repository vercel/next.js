'use client'

export default function Page() {
  if (typeof window === 'undefined') {
    throw new Error('client-page-edge-error')
  }
  return <div>client-page</div>
}

export const dynamic = 'force-dynamic'
export const runtime = 'edge'
