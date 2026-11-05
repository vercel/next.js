import { connection } from 'next/server'
import { testRequestAPIs } from '../helpers'

export default async function Page({ searchParams }) {
  const { requestId } = await searchParams
  await connection()
  testRequestAPIs('/request-apis/page-dynamic', requestId)
  return null
}
