import { cacheLife } from 'next/cache'
import { readShortLived } from '../../cache'

export default async function Page() {
  'use cache'
  cacheLife('default')
  await readShortLived('shared')
  return <p>Warmup complete</p>
}
