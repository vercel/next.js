import { randomUUID } from 'node:crypto'
import { cacheLife, cacheTag } from 'next/cache'
import { connection } from 'next/server'
export async function cachedState(route, params) {
  'use cache'
  cacheLife({
    stale: 30,
    revalidate: params.item?.startsWith('fast-') ? 1 : 3600,
    expire: 7200,
  })
  cacheTag(`state:${route}:${params.item || 'shell'}`)
  return { route, params, generation: randomUUID() }
}
export async function Content({ route, params }) {
  return (
    <pre id="route-state">
      {JSON.stringify(await cachedState(route, await params))}
    </pre>
  )
}
export async function Dynamic() {
  await connection()
  return <pre id="dynamic-state">{randomUUID()}</pre>
}
export async function sharedData() {
  'use cache'
  cacheLife('max')
  return randomUUID()
}
