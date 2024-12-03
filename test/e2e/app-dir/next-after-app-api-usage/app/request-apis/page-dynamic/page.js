import { connection } from 'next/server'
import { testRequestAPIs } from '../helpers'

export default async function Page() {
  await connection()
  testRequestAPIs()
  return null
}
