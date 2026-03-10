export default function WithNestedLayout({
  children,
  slot,
}: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <div>
      <div id="nested-children">{children}</div>
      <div id="nested-slot">{slot}</div>
    </div>
  )
}
