import { connection } from 'next/server'
import { BrowserOnlyContent } from './browser-only-content'

export default async function Page() {
  await connection()
  return <BrowserOnlyContent />
}
