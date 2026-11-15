import { unstable_cache } from 'next/cache'
import { connection } from 'next/server'
import { getTenantData } from '../shared'

export default async function Page() {
  await connection()
  const data = await unstable_cache(getTenantData)()
  return <p id="value">{JSON.stringify(data)}</p>
}
