import { connection } from 'next/server'
import AsyncClient from './async-client'

export default async function Page() {
  await connection()
  return <AsyncClient />
}
