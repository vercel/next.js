'use client'

/**
 * This is a client component layout. Even though it has access to params via
 * the props, it doesn't access them on the server during rendering. This means
 * the segment's varyParams should be an empty set, allowing the prefetched
 * data to be reused across different param values.
 */
export default function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div data-client-layout="true">
      <div>Client Layout (use client)</div>
      {children}
    </div>
  )
}
