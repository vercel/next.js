import { delayOrigin, hash01 } from '../../delay-origin'

const SLOW_PAGES = Number(process.env.BENCH_SLOW_PAGES || 300)

export function generateStaticParams() {
  return Array.from({ length: SLOW_PAGES }, (_, i) => ({ id: String(i) }))
}

export default async function Page({ params }) {
  const { id } = await params
  // A slow upstream: 200-500ms per page, deterministic per id.
  const ms = 200 + Math.floor(hash01(id) * 300)
  const [slow, shared] = await Promise.all([
    fetch(`${delayOrigin()}/delay?id=${id}&ms=${ms}`, {
      cache: 'force-cache',
    }).then((res) => res.json()),
    fetch(`${delayOrigin()}/shared?bucket=${Number(id) % 20}&ms=20`, {
      cache: 'force-cache',
    }).then((res) => res.json()),
  ])
  return (
    <main>
      <h1>Slow page {id}</h1>
      <p>
        waited {slow.ms}ms, bucket {shared.bucket}
      </p>
    </main>
  )
}
