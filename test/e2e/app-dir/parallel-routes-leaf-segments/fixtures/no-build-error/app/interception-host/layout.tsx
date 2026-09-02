export default function Layout({
  children,
  content,
  modal,
}: {
  children: React.ReactNode
  content: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <main>
      <section id="children">{children}</section>
      <section id="content">{content}</section>
      <section id="modal">{modal}</section>
    </main>
  )
}
