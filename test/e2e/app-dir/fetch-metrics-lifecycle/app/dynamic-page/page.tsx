import { connection } from 'next/server'
import { fetchAndReport } from '../../fetch-and-report'

export default async function Page() {
  await connection()
  await fetchAndReport('dynamic-page')
  return <p>Page fetch metrics</p>
}
