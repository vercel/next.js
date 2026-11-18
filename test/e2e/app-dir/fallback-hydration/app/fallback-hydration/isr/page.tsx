import { randomUUID } from 'node:crypto'
import { unstable_cache } from 'next/cache'

const getGeneration = unstable_cache(
  async () => randomUUID(),
  ['fallback-hydration:generation'],
  {
    tags: ['fallback-hydration:generation'],
  }
)

export default async function Page() {
  return <p id="generation">{await getGeneration()}</p>
}
