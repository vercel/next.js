'use client'

// This component uses the same pattern as Next.js's internal BailoutToCSR
// component (packages/next/src/shared/lib/lazy-dynamic/dynamic-bailout-to-csr.tsx):
// throw on the server (typeof window === 'undefined'), render normally on the client.
//
// Because the parent layout calls connection(), the route is only SSR'd at
// request time — it is never prerendered/statically generated at build time,
// so the throw only happens during SSR, not during a build.
export default function Page() {
  if (typeof window === 'undefined') {
    throw new Error('this is an SSR-only error')
  }

  return <p id="ssr-page-content">Rendered on client</p>
}
