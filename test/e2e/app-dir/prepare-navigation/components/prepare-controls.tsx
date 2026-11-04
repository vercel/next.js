'use client'

import { useRouter } from 'next/navigation'
import { useRef } from 'react'

type PreparedNavigation = ReturnType<
  NonNullable<ReturnType<typeof useRouter>['experimental_prepare']>
>

// Buttons rather than links, so nothing here triggers a prefetch.
export function PrepareControls({ hrefs }: { hrefs: Array<string> }) {
  const router = useRouter()
  const prepared = useRef(new Map<string, PreparedNavigation>())
  return (
    <div>
      {hrefs.map((href) => (
        <div key={href}>
          <button
            data-prepare={href}
            onClick={() => {
              prepared.current.set(href, router.experimental_prepare!(href))
            }}
          >
            Prepare {href}
          </button>
          <button
            data-commit-push={href}
            onClick={() => prepared.current.get(href)!.push()}
          >
            Commit {href} (push)
          </button>
          <button
            data-commit-replace={href}
            onClick={() => prepared.current.get(href)!.replace()}
          >
            Commit {href} (replace)
          </button>
          <button data-push={href} onClick={() => router.push(href)}>
            Regular push {href}
          </button>
        </div>
      ))}
      <button data-refresh onClick={() => router.refresh()}>
        Refresh
      </button>
    </div>
  )
}
