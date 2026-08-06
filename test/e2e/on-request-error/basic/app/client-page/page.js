'use client'

export default async function Page() {
  if (typeof window === 'undefined') {
    throw new Error('client-page-node-error')
  }
  return <div>client-page</div>
}
