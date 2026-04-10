export default function InboxLayout({ children, modal }) {
  return (
    <main>
      {children}
      <section id="modal-slot">{modal}</section>
    </main>
  )
}
