import { connection } from 'next/server'
import { action } from './action'
import { getData } from './get-data'

export default async function Page() {
  await connection()

  return <span id="data">{await getData(action)}</span>
}
