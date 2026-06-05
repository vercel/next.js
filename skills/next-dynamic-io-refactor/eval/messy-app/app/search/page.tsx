// ⛔ MESSY: top-level `await searchParams`. Search params are never build-known,
// so awaiting them outside a boundary makes the whole page dynamic and keeps the
// static <h1> out of the shell. (Fix: lever 1 / searchParams special case —
// keep the heading + form in the shell; pass the searchParams promise into a
// <Suspense>-wrapped <Results> that awaits it.)
import { searchProducts } from '@/lib/data'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const results = await searchProducts(q)

  return (
    <section>
      <h1>Search</h1>
      <form>
        <input name="q" defaultValue={q} placeholder="Search products" />
      </form>
      <ul>
        {results.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
    </section>
  )
}
