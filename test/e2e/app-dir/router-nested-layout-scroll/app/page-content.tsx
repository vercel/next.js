export default function PageContent({ name }: { name: string }) {
  return (
    <section id="page-content" style={{ height: 2000, paddingTop: 1 }}>
      <p id="page-name">{name}</p>
      <p id="target" style={{ marginTop: 900 }}>
        Anchor target
      </p>
    </section>
  )
}
