import { type ReactNode } from 'react'

// Validation level is 'manual-warning' (set in next.config.ts).
//
// No Suspense around `{children}`, so a violating bare page (runtime data
// at the top, no Suspense) leaves the static shell empty.
//
// Crucially, this layout does NOT export `unstable_instant = false`. If it
// did, `isPageAllowedToBlock` would mark every route under this layout as
// blocking-allowed, which suppresses the static-shell empty-shell error.
// We want that error to surface here as the contrast against the
// `with-root-suspense/` tree.

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
