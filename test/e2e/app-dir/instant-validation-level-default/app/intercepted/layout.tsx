export default function InterceptedLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <div id="intercepted-layout">
      <div id="children-slot">{children}</div>
      <div id="modal-slot">{modal}</div>
    </div>
  )
}
