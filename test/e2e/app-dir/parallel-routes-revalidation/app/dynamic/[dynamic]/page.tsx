'use client'
import { use } from 'react'
import { useRouter } from 'next/navigation'

export default function Page({
  params,
}: {
  params: Promise<{ dynamic: string }>
}) {
  const router = useRouter()
  return (
    <div>
      <h2 id="detail-title">Detail Page (Non-Intercepted)</h2>
      <p id="params">{use(params).dynamic}</p>
      <span suppressHydrationWarning id="random-number">
        {Math.random()}
      </span>
      <button onClick={() => router.refresh()}>Refresh</button>
    </div>
  )
}
