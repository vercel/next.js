import { connection } from 'next/server'
import { getDate } from '../logic'

async function getData() {
  'use cache: remote'

  return getDate()
}

export async function GET() {
  await connection()

  return new Response(await getData())
}
