import type { ReactNode } from 'react'

/**
 * Pruned URLs fall through to the root not-found UI without rendering any of
 * the route-level layouts below. Their tests use those layout IDs to verify
 * that an incomplete matcher was omitted instead of selected.
 */
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <div id="root-layout">root layout</div>
        {children}
      </body>
    </html>
  )
}
