import { delayOrigin } from '../../delay-origin'

const FAST_PAGES = Number(process.env.BENCH_FAST_PAGES || 2400)

export function generateStaticParams() {
  return Array.from({ length: FAST_PAGES }, (_, i) => ({ id: String(i) }))
}

export default async function Page({ params }) {
  const { id } = await params
  // A quick, shared fetch: 20 distinct URLs shared by every fast page, so the
  // fetch cache hit rate depends on how pages are spread across caches.
  const res = await fetch(
    `${delayOrigin()}/shared?bucket=${Number(id) % 20}&ms=20`,
    { cache: 'force-cache' }
  )
  const data = await res.json()
  return (
    <main>
      <h1>Fast page {id}</h1>
      <p>bucket {data.bucket}</p>
      <ul>
        {Array.from({ length: 50 }, (_, i) => (
          <li key={i}>
            item {i} of page {id}
          </li>
        ))}
      </ul>
    </main>
  )
}
