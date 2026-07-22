export default function ParallelLayout({
  children,
  slot,
}: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <div>
      <div id="parallel-children">{children}</div>
      <div id="parallel-slot">{slot}</div>
    </div>
  )
}
