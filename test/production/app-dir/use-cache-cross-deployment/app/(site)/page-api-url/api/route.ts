import { connection } from 'next/server'
import { getUrl } from '../get-url'

export async function GET() {
  await connection()
  return new Response(await getUrl())
}
