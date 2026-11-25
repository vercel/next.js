import { connection } from 'next/server'
import { getPageApiValue } from '../get-value'

export async function GET() {
  await connection()
  return new Response(await getPageApiValue('page-api'))
}
