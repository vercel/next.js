import { connection } from 'next/server'
import { getData } from '../../lib/data'

export default async function Page() {
  // Rendered per request, so every request reads the fetch cache.
  await connection()
  return <p id="data">{await getData('dynamic')}</p>
}
