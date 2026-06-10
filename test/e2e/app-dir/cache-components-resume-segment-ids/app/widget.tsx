import { cacheLife } from 'next/cache'

async function getLongLivedData(index: number) {
  'use cache'
  // Resolves during the build prerender and gets outlined into hidden
  // segments baked into the static document — but goes stale quickly, so
  // runtime requests re-render these boundaries in a fresh continuation.
  cacheLife({ stale: 5, revalidate: 10, expire: 300 })

  return `long-widget-${index}-data`
}

export async function LongWidget({ index }: { index: number }) {
  const data = await getLongLivedData(index)

  // Render enough content that React outlines this boundary into a hidden
  // segment (content larger than progressiveChunkSize) instead of inlining.
  const filler = Array.from({ length: 600 }, (_, i) => `${data}-row-${i}`)

  return (
    <div className="long-widget">
      <p>{data}</p>
      <ul>
        {filler.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </div>
  )
}
