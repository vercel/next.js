import { connection } from 'next/server'
import { unstable_cache, refresh } from 'next/cache'

const cachedFunction = unstable_cache(async () => {
  refresh()
  return 'data'
}, ['test-key'])

export default async function Page() {
  await connection()
  const data = await cachedFunction()
  return <div>{data}</div>
}
