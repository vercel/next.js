import { cacheLife } from 'next/cache'

export async function Hero({ id }: { id: string }) {
  'use cache'
  cacheLife('short')
  return (
    <>
      {/* React emits a preload Link header for a high-priority image. */}
      <img src="/hero.png" fetchPriority="high" alt="" />
      <p id="page">{id}</p>
      <p id="rendered-at">{Date.now()}</p>
    </>
  )
}
