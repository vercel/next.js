export default function NestedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div id="nested-layout">
      <h2>Nested layout</h2>
      {children}
    </div>
  )
}
