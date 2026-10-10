export function generateStaticParams() {
  return Array.from({ length: 20 }, (_, n) => ({ n: String(n) }))
}

export default async function StaticPage({ params }) {
  const { n } = await params
  return (
    <main>
      <h1>static {n}</h1>
      <p>Fully static page, prerendered at build time.</p>
    </main>
  )
}
