import { connection } from 'next/server'
import { getGeneratorValue } from '../../../generator-value'

export async function GET() {
  await connection()
  return new Response(await getGeneratorValue('page-api'))
}
