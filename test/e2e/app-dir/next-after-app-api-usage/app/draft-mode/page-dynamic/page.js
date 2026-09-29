import { connection } from 'next/server'
import { testDraftMode } from '../helpers'

export default async function Page({ searchParams }) {
  const { requestId } = await searchParams
  await connection()
  testDraftMode('/draft-mode/page-dynamic', requestId)
  return null
}
