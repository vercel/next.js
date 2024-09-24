export default function Layout({ children, modal }) {
  return (
    <>
      <div id="modal-data">{modal}</div>
      <div id="children-data">{children}</div>
    </>
  )
}
