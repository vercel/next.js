'use client'

import { useRouter } from 'next/navigation'

const slugs = ['alpha', 'bravo', 'charlie', 'delta', 'echo']

export function PrefetchButtons() {
  const router = useRouter()
  return (
    <>
      <button
        data-prefetch-all
        onClick={() => {
          // Schedule all sibling prefetches in the same tick, exceeding the
          // scheduler's concurrent request limit.
          for (const slug of slugs) {
            router.prefetch(`/products/${slug}`)
          }
        }}
      >
        Prefetch all siblings
      </button>
    </>
  )
}
