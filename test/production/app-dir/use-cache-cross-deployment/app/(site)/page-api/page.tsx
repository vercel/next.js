import { connection } from 'next/server'
import { getPageApiValue } from './get-value'
import { getKind } from './server-api'

export default async function Page() {
  await connection()
  return <p id="page-api-data">{await getPageApiValue(getKind())}</p>
}
