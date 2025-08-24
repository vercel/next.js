import { connection } from 'next/server'
import { testDraftMode } from '../helpers'

export default async function Page() {
  await connection()
  testDraftMode('/draft-mode/page-dynamic')
  return null
}
