export default function Layout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <>
      <div id="children">{children}</div>
      <div id="modal">{modal}</div>
    </>
  )
}
