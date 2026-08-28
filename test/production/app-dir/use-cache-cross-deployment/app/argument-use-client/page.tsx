import { connection } from 'next/server'
import { client } from './client'
import { getData } from './get-data'

export default async function Page() {
  await connection()

  return <span id="data">{await getData(client)}</span>
}
