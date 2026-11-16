'use client'

import { useRouter } from 'next/navigation'

export function ReplaceButton({ id, href }: { id: string; href: string }) {
  const router = useRouter()
  return (
    <button id={id} onClick={() => router.replace(href)}>
      Go to {href}
    </button>
  )
}
