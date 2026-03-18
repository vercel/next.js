export default function NoChildrenLayout({
  children,
  slot,
}: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <>
      <div id="slot">{slot}</div>
      <div id="children">{children}</div>
    </>
  )
}
