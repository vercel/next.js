'use client'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  return (
    <div>
      <h2 id="detail-title">Detail Page (Non-Intercepted)</h2>
      <span suppressHydrationWarning id="random-number">
        {Math.random()}
      </span>
      <button onClick={() => router.refresh()}>Refresh</button>
    </div>
  )
}
