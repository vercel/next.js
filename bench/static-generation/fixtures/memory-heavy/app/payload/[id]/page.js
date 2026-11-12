const PAGES = Number(process.env.BENCH_MEM_PAGES || 160)
// Live objects held per page while it waits on "upstream" data.
const OBJECTS = Number(process.env.BENCH_MEM_OBJECTS || 500000)
const WAIT_MS = Number(process.env.BENCH_MEM_WAIT_MS || 4000)

export function generateStaticParams() {
  return Array.from({ length: PAGES }, (_, i) => ({ id: String(i) }))
}

export default async function Page({ params }) {
  const { id } = await params
  // A big per-page payload (roughly 50MB of live heap with the defaults)
  // that stays alive across an await, the way a large CMS response would.
  const payload = Array.from({ length: OBJECTS }, (_, i) => ({
    i,
    label: `row-${id}-${i}`,
  }))
  await new Promise((resolve) => setTimeout(resolve, WAIT_MS))
  let checksum = 0
  for (const row of payload) checksum = (checksum + row.label.length) | 0
  return (
    <main>
      <h1>Payload page {id}</h1>
      <p>
        rows {payload.length}, checksum {checksum}
      </p>
      <pre>
        {payload
          .slice(0, 2000)
          .map((row) => row.label)
          .join('\n')}
      </pre>
    </main>
  )
}
