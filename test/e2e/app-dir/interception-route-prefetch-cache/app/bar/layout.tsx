export default function BarLayout({
  modal,
  children,
}: {
  modal: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <>
      <div id="slot">{modal}</div>
      <div id="children">{children}</div>
    </>
  )
}
