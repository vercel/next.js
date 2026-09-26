'use client'

import { usePathname, useRouter } from 'next/navigation'

/**
 * Same-route navigations driven by the router API rather than `next/link`.
 *
 * `next/link` would prefetch the same route and overwrite its cache entry with
 * a correctly hashless canonical URL, masking the bug under test.
 */
export function HashControls() {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <>
      <button
        id="replace-without-hash"
        onClick={() => router.replace(pathname, { scroll: false })}
      >
        replace without hash
      </button>
      <button
        id="push-other-hash"
        onClick={() => router.push(`${pathname}#other`, { scroll: false })}
      >
        push #other
      </button>
    </>
  )
}
