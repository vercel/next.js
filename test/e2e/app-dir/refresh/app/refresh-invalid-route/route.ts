import { refresh } from 'next/cache'
import { connection } from 'next/server'

export async function GET() {
  await connection()
  refresh()
  return new Response('ok')
}
