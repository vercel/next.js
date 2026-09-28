/**
 * /specific has an exact page in both children and @slot, so it remains a
 * complete matcher regardless of catch-all pruning elsewhere in the app.
 */
export default function OptionalChildrenCatchallLayout({
  children,
  slot,
}: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <main id="optional-children-catchall-layout">
      {children}
      {slot}
    </main>
  )
}
