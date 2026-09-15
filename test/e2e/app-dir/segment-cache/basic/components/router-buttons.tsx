'use client'

import { useRouter } from 'next/navigation'

export function RouterPushButton({ href }: { href: string }) {
  const router = useRouter()
  return (
    <button data-router-push={href} onClick={() => router.push(href)}>
      Navigate without prefetching
    </button>
  )
}

export function RouterPrefetchButton({ href }: { href: string }) {
  const router = useRouter()
  return (
    <button data-router-prefetch={href} onClick={() => router.prefetch(href)}>
      Prefetch
    </button>
  )
}
