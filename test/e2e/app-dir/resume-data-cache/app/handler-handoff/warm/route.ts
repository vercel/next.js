import { connection } from 'next/server'
import { readData } from '../data'

export async function GET() {
  await connection()
  return new Response(await readData('rdc-handler-handoff'))
}
