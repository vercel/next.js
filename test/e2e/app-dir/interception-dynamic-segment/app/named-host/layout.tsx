export default function Layout({
  canonical,
  content,
  modal,
  secondary,
}: {
  canonical: React.ReactNode
  content: React.ReactNode
  modal: React.ReactNode
  secondary: React.ReactNode
}) {
  return (
    <main id="named-host">
      <section id="named-host-canonical">{canonical}</section>
      <section id="named-host-content">{content}</section>
      <section id="named-host-secondary">{secondary}</section>
      <section id="named-host-modal">{modal}</section>
    </main>
  )
}
