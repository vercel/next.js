export default function Layout({
  children,
  slot,
}: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <>
      Children: <div id="children">{children}</div>
      Slot: <div id="slot">{slot}</div>
    </>
  )
}
