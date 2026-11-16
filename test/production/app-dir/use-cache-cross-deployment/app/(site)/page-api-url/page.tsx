import { connection } from 'next/server'
import { getUrl } from './get-url'

export default async function Page() {
  await connection()
  return <p id="page-api-url">{await getUrl()}</p>
}
