// ⛔ MESSY: top-level `await` of uncached I/O (getProducts → fs.readFile), and
// the LCP heading is rendered AFTER the await so it can't paint until the read
// resolves. The product list is the SAME for every user → it should be cached
// and join the shell. (Fix: lever 3 — wrap getProducts in 'use cache'; keep the
// <h1> static and above any boundary.)
import { getProducts } from '@/lib/data'

export default async function HomePage() {
  const products = await getProducts()

  return (
    <section>
      <h1>Store</h1>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            {p.name} — ${p.price}
          </li>
        ))}
      </ul>
    </section>
  )
}
