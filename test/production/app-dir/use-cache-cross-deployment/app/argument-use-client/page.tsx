import { connection } from 'next/server'
import { Client } from './client'
import { getData } from './get-data'

export const instant = false

export default async function Page() {
  await connection()

  return <div>{await getData(Client)}</div>
}
