export default function Layout({
  content,
  modal,
  secondary,
}: {
  content: React.ReactNode
  modal: React.ReactNode
  secondary: React.ReactNode
}) {
  return (
    <main id="named-host">
      <section id="named-host-content">{content}</section>
      <section id="named-host-secondary">{secondary}</section>
      <section id="named-host-modal">{modal}</section>
    </main>
  )
}
