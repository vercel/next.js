'use client'

import { useRouter } from 'next/navigation'

type Router = ReturnType<typeof useRouter>
type PrefetchOptions = Parameters<Router['prefetch']>[1]

export function PrefetchButton({ href }: { href: string }) {
  const router = useRouter()
  return (
    <button
      data-prefetch-navigation={href}
      onClick={() =>
        router.prefetch(href, {
          kind: 'navigation' as NonNullable<PrefetchOptions>['kind'],
        })
      }
    >
      router.prefetch({href}, {'{ kind: "navigation" }'})
    </button>
  )
}
