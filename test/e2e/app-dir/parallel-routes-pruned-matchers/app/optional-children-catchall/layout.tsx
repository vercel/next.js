/**
 * The optional children catch-all can match the segment root or any suffix,
 * while @slot only matches /specific. The broad optional matcher is pruned,
 * but /specific remains because both slots have an exact page for that URL.
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
